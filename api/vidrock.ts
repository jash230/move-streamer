// Resolves a VidRock title to real HLS URLs, server-side, so the viewer's IP never touches
// VidRock or its CDNs — the browser only ever talks to /api/stream (see stream.ts).
//
// VidRock's /api/{movie|tv}/… returns one encrypted token per server; each is
// base64url( 12-byte AES-GCM IV ‖ ciphertext‖tag ) and decrypts to the signed .m3u8.
// The key is a static constant lifted from VidRock's JS bundle — they rotate it on deploys,
// so if decryption starts failing, re-grab it from https://vidrock.net/assets/index-*.js.
import { json, error } from './_lib/http.js'
import { STREAM_ALLOW } from './_lib/stream-hosts.js'

const KEY_HEX = '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)))

const b64urlBytes = (s: string) => {
  let e = s.replace(/-/g, '+').replace(/_/g, '/')
  if (e.length % 4 === 2) e += '=='
  else if (e.length % 4 === 3) e += '='
  const bin = atob(e)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

let keyP: Promise<CryptoKey> | undefined
const key = () => (keyP ??= crypto.subtle.importKey('raw', hexBytes(KEY_HEX), { name: 'AES-GCM' }, false, ['decrypt']))

async function decrypt(token: string) {
  const b = b64urlBytes(token)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(), b.slice(12))
  return new TextDecoder().decode(pt)
}

const allowed = (host: string) => STREAM_ALLOW.some((d) => host === d || host.endsWith('.' + d))

// GET /api/vidrock?type=movie&id=27205  or  ?type=tv&id=1399&season=1&episode=1
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const type = q.get('type')
  const id = q.get('id') ?? ''
  if ((type !== 'movie' && type !== 'tv') || !/^\d+$/.test(id)) return error('bad params', 400)
  const path =
    type === 'movie' ? `movie/${id}` : `tv/${id}/${Number(q.get('season')) || 1}/${Number(q.get('episode')) || 1}`

  const res = await fetch(`https://vidrock.net/api/${path}`, { headers: { Referer: 'https://vidrock.net/', 'User-Agent': UA } })
  if (!res.ok) return error('vidrock upstream failed', 502)
  const data = (await res.json()) as Record<string, { url?: string }>

  const servers: { name: string; url: string }[] = []
  for (const [name, v] of Object.entries(data)) {
    if (!v?.url) continue
    try {
      const m3u8 = await decrypt(v.url)
      // Only hand back servers our proxy will actually fetch; the rest can't play anyway.
      if (allowed(new URL(m3u8).host)) servers.push({ name, url: `/api/stream?url=${encodeURIComponent(m3u8)}` })
    } catch { /* rotated key or dead server — skip */ }
  }
  return json({ servers })
}
