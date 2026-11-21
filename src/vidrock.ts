// Resolving VidRock has to happen in the browser: its /api sits behind Cloudflare, which blocks
// datacenter IPs, so a server-side call from Vercel gets a 403. The browser's own (residential) IP
// is fine, and /api sends `Access-Control-Allow-Origin: *`. Only the stream itself is then proxied
// through /api/stream — which VidRock's CDNs *do* allow from Vercel — so the viewer's IP stays off
// those CDNs. The one request the browser still makes to VidRock is this small resolve JSON.
//
// Each server's `url` is base64url( 12-byte AES-GCM IV ‖ ciphertext‖tag ), decrypting to the signed
// .m3u8. The key is a static constant from VidRock's JS bundle (not a secret — it ships to every
// visitor of vidrock.net); they rotate it on deploys, so if this stops working, re-grab it from
// https://vidrock.net/assets/index-*.js.
import type { MediaType } from './api'
import { VIDROCK_KEY_HEX } from './vidrockKey'

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
const key = () => (keyP ??= crypto.subtle.importKey('raw', hexBytes(VIDROCK_KEY_HEX), { name: 'AES-GCM' }, false, ['decrypt']))

export async function decryptToken(token: string) {
  if (!globalThis.crypto?.subtle) {
    if (!import.meta.env.DEV) throw new Error('Web Crypto is unavailable on this origin')
    const res = await fetch('/api/dev/vidrock-decrypt', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: token })
    if (!res.ok) throw new Error(`Local token decryption failed (${res.status})`)
    return res.text()
  }
  const b = b64urlBytes(token)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await key(), b.slice(12))
  return new TextDecoder().decode(pt)
}

export interface VidrockServer { name: string; url: string }

// Returns each playable server as a /api/stream proxy link, in VidRock's own order.
export async function resolveVidrock(type: MediaType, id: string, season: number, episode: number): Promise<VidrockServer[]> {
  const path = type === 'movie' ? `movie/${id}` : `tv/${id}/${season}/${episode}`
  const res = await fetch(`https://vidrock.net/api/${path}`)
  if (!res.ok) return []
  const data = (await res.json()) as Record<string, { url?: string }>
  const servers: VidrockServer[] = []
  for (const [name, v] of Object.entries(data)) {
    if (!v?.url) continue
    // The /api/stream proxy enforces its own host allowlist, so a dead/off-list server just 403s
    // and NativePlayer falls through to the next one — no need to filter hosts here.
    try { servers.push({ name, url: `/api/stream?url=${encodeURIComponent(await decryptToken(v.url))}` }) } catch { /* bad token */ }
  }
  return servers
}
