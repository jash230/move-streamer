import { describe, expect, it } from 'vitest'
import { allowed, rewriteManifest } from './stream.js'

describe('allowed (SSRF guard)', () => {
  it('permits any public CDN host over https (VidRock rotates them)', () => {
    expect(allowed(new URL('https://vercetti.org/movie/x/bigtits.m3u8'))).toBe(true)
    expect(allowed(new URL('https://img1.hscow.com/hls/x/index.m3u8'))).toBe(true)
    expect(allowed(new URL('https://img1.fcxmb.com/hls/x/index.m3u8'))).toBe(true)
  })
  it('rejects http and internal/private targets', () => {
    expect(allowed(new URL('http://vercetti.org/x.m3u8'))).toBe(false) // not https
    expect(allowed(new URL('https://169.254.169.254/latest/meta-data/'))).toBe(false) // cloud metadata
    expect(allowed(new URL('http://169.254.169.254/latest/meta-data/'))).toBe(false)
    expect(allowed(new URL('https://127.0.0.1/x'))).toBe(false)
    expect(allowed(new URL('https://10.0.0.5/x'))).toBe(false)
    expect(allowed(new URL('https://localhost/x'))).toBe(false)
    expect(allowed(new URL('https://db.internal/x'))).toBe(false)
    expect(allowed(new URL('https://[::1]/x'))).toBe(false)
    expect(allowed(new URL('https://2130706433/x'))).toBe(false) // decimal-int 127.0.0.1
  })
})

describe('rewriteManifest', () => {
  it('routes relative, absolute and URI="" references back through the proxy, leaving other tags alone', () => {
    const base = 'https://vercetti.org/movie/abc/bigtits.m3u8'
    const m3u8 = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://vercetti.org/key/k.bin",IV=0x1',
      '#EXTINF:10.0,',
      'seg/0.ts',
      '#EXTINF:10.0,',
      'https://rapidcloud.live/seg/1.ts',
    ].join('\n')
    const out = rewriteManifest(m3u8, base).split('\n')
    expect(out[0]).toBe('#EXTM3U')
    expect(out[1]).toContain('URI="/api/stream?url=' + encodeURIComponent('https://vercetti.org/key/k.bin'))
    expect(out[3]).toBe('/api/stream?url=' + encodeURIComponent('https://vercetti.org/movie/abc/seg/0.ts'))
    expect(out[5]).toBe('/api/stream?url=' + encodeURIComponent('https://rapidcloud.live/seg/1.ts'))
  })
})
