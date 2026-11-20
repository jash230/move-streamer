import { describe, expect, it } from 'vitest'
import { decryptToken } from './vidrock'

// Mirror VidRock's scheme to produce a token, then confirm decryptToken recovers the plaintext.
async function encrypt(plaintext: string) {
  const keyBytes = Uint8Array.from('7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f'.match(/../g)!.map((b) => parseInt(b, 16)))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)))
  const joined = new Uint8Array(iv.length + ct.length)
  joined.set(iv); joined.set(ct, iv.length)
  let bin = ''
  for (const b of joined) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('decryptToken', () => {
  it('recovers the .m3u8 URL from a base64url(IV ‖ ciphertext) token', async () => {
    const url = 'https://vercetti.org/movie/bTwndMfHcTPIrd1MKnTeMAqafBQDs8IxJswXdUUk9Iw.65K7RXM8/bigtits.m3u8'
    expect(await decryptToken(await encrypt(url))).toBe(url)
  })
})
