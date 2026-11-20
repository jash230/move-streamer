// HLS proxy: the browser fetches every manifest, playlist and segment from here instead of from
// VidRock's CDNs, so those CDNs only ever see this server's IP, never the viewer's. It also adds
// the Referer/Origin the CDNs require and rewrites manifests so child URLs come back through here.
import { error } from './_lib/http.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// VidRock rotates its HLS CDNs constantly (random throwaway domains), so a static host allowlist
// just breaks titles whenever a new CDN shows up. Instead guard the only thing that matters for
// SSRF: require https and reject anything that could point at internal infra — IP-literal hosts
// (metadata endpoints, localhost, private ranges) and internal names. CDNs always use public
// domain names, so this blocks nothing real.
// shortcut: hostname-only, so a public domain that resolves to a private IP (DNS rebinding) still
// gets through; add resolve-then-check if the proxy ever runs somewhere with reachable internal services.
const internalHost = (h: string) =>
  h.includes(':') || // IPv6 literal
  /^(\d+\.){0,3}\d+$/.test(h) || // IPv4 / decimal-int literal
  /^0x/i.test(h) || // hex-int literal
  /(^|\.)(localhost|local|internal|lan|corp|home)$/i.test(h)
export const allowed = (u: URL) => u.protocol === 'https:' && !internalHost(u.hostname)

const proxied = (uri: string, base: string) => `/api/stream?url=${encodeURIComponent(new URL(uri, base).toString())}`

// Point segment/playlist/key URIs back at this proxy, resolving relative ones against the manifest URL.
export function rewriteManifest(text: string, base: string) {
  return text
    .split('\n')
    .map((line) => {
      const l = line.trim()
      if (!l) return line
      if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxied(uri, base)}"`)
      return proxied(l, base)
    })
    .join('\n')
}

// Follow redirects ourselves, re-checking the allowlist on every hop so a CDN can't redirect the
// proxy to an off-list (e.g. internal) host.
async function fetchUpstream(start: URL, headers: HeadersInit) {
  let current = start
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(current, { headers, redirect: 'manual' })
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!loc) return { res, finalUrl: current.toString() }
    const next = new URL(loc, current)
    if (!allowed(next)) throw new Error('redirect to disallowed host')
    current = next
  }
  throw new Error('too many redirects')
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('url')
  if (!target) return error('missing url', 400)
  let t: URL
  try { t = new URL(target) } catch { return error('bad url', 400) }
  if (!allowed(t)) return error('host not allowed', 403)

  const range = request.headers.get('range')
  const headers: Record<string, string> = { Referer: 'https://vidrock.net/', Origin: 'https://vidrock.net', 'User-Agent': UA }
  if (range) headers.Range = range

  let upstream: { res: Response; finalUrl: string }
  try { upstream = await fetchUpstream(t, headers) } catch { return error('upstream fetch failed', 502) }
  const { res, finalUrl } = upstream

  const isM3u8 = /mpegurl/i.test(res.headers.get('content-type') ?? '') || new URL(finalUrl).pathname.endsWith('.m3u8')
  if (isM3u8) {
    const body = rewriteManifest(await res.text(), finalUrl)
    return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' } })
  }

  // Segments / keys: stream bytes straight through, preserving range/length for seeking.
  const out = new Headers({ 'Cache-Control': 'no-store' })
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = res.headers.get(k)
    if (v) out.set(k, v)
  }
  return new Response(res.body, { status: res.status, headers: out })
}
