import { describe, expect, it } from 'vitest'
import { parseBatch, parseUA, referrerHost, summarize, type IncomingEvent } from './ingest.js'

const NOW = 1_780_000_000_000
const ev = (t: IncomingEvent['t'], p = '/', at = NOW, d?: IncomingEvent['d']): IncomingEvent => ({ t, p, at, ...(d ? { d } : {}) })
const batch = (over: Record<string, unknown> = {}) => ({ v: 'visitor_12345', s: 'session_12345', e: [ev('page_view')], ...over })

describe('parseBatch', () => {
  it('accepts a well-formed batch', () => {
    const b = parseBatch(batch(), NOW)
    expect('error' in b).toBe(false)
  })

  it('rejects bad ids, unknown event types and empty batches', () => {
    expect(parseBatch(batch({ v: 'x' }), NOW)).toHaveProperty('error')
    expect(parseBatch(batch({ s: 'has spaces in it' }), NOW)).toHaveProperty('error')
    expect(parseBatch(batch({ e: [] }), NOW)).toHaveProperty('error')
    expect(parseBatch(batch({ e: [{ t: 'hack', p: '/', at: NOW }] }), NOW)).toHaveProperty('error')
    expect(parseBatch(batch({ e: [{ t: 'page_view', p: 'no-slash', at: NOW }] }), NOW)).toHaveProperty('error')
    expect(parseBatch(null, NOW)).toHaveProperty('error')
  })

  it('caps the batch size', () => {
    const e = Array.from({ length: 51 }, () => ev('heartbeat'))
    expect(parseBatch(batch({ e }), NOW)).toHaveProperty('error')
  })

  it('replaces clock-skewed timestamps with server time', () => {
    const b = parseBatch(batch({ e: [ev('page_view', '/', NOW - 60 * 60_000)] }), NOW)
    if ('error' in b) throw new Error(b.error)
    expect(b.e[0].at).toBe(NOW)
  })

  it('keeps only simple props and truncates long strings', () => {
    const b = parseBatch(batch({ e: [ev('search', '/search', NOW, { q: 'x'.repeat(500), results: 3, nested: { a: 1 } as never })] }), NOW)
    if ('error' in b) throw new Error(b.error)
    expect(b.e[0].d).toEqual({ q: 'x'.repeat(200), results: 3 })
  })
})

describe('summarize', () => {
  it('flags a single home page view as not engaged (a bounce)', () => {
    const s = summarize([ev('page_view', '/'), ev('heartbeat', '/', NOW + 30_000)])
    expect(s).toMatchObject({ pageviews: 1, engaged: false, entryPath: '/', first: NOW, last: NOW + 30_000 })
  })

  it('counts any other page as engagement', () => {
    expect(summarize([ev('page_view', '/tv')]).engaged).toBe(true)
  })

  it('counts a second page view as engagement', () => {
    expect(summarize([ev('page_view', '/'), ev('page_view', '/')]).engaged).toBe(true)
  })

  it('counts plays and searches on the home page as engagement', () => {
    expect(summarize([ev('page_view', '/'), ev('search', '/', NOW, { q: 'dune' })]).engaged).toBe(true)
    expect(summarize([ev('play_start', '/')]).engaged).toBe(true)
  })

  it('takes the entry path from the first page view', () => {
    expect(summarize([ev('heartbeat', '/x'), ev('page_view', '/movie/1'), ev('page_view', '/')]).entryPath).toBe('/movie/1')
  })
})

describe('parseUA', () => {
  it('reads an iPhone Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    expect(parseUA(ua)).toEqual({ bot: false, device: 'Mobile', browser: 'Safari', os: 'iOS' })
  })

  it('reads desktop Chrome on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
    expect(parseUA(ua)).toEqual({ bot: false, device: 'Desktop', browser: 'Chrome', os: 'Windows' })
  })

  it('reads Edge, Samsung Internet on Android and iPad', () => {
    expect(parseUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140 Safari/537.36 Edg/140.0').browser).toBe('Edge')
    const samsung = parseUA('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36')
    expect(samsung).toMatchObject({ device: 'Mobile', browser: 'Samsung Internet', os: 'Android' })
    expect(parseUA('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1').device).toBe('Tablet')
  })

  it('spots bots and empty agents', () => {
    expect(parseUA('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').bot).toBe(true)
    expect(parseUA('Mozilla/5.0 HeadlessChrome/140').bot).toBe(true)
    expect(parseUA('').bot).toBe(true)
  })
})

describe('referrerHost', () => {
  it('returns the host without www', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'cucuflix.com')).toBe('google.com')
  })

  it('ignores self-referrals, empty and invalid values', () => {
    expect(referrerHost('https://cucuflix.com/tv', 'cucuflix.com')).toBeNull()
    expect(referrerHost('https://www.cucuflix.com/tv', 'cucuflix.com')).toBeNull()
    expect(referrerHost('', 'cucuflix.com')).toBeNull()
    expect(referrerHost('not a url', 'cucuflix.com')).toBeNull()
  })
})
