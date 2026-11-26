import type { Redis } from '@upstash/redis'
import { describe, expect, it } from 'vitest'
import type { Sql } from './db.js'
import { enqueue, flush, flushDue, mergeSessions, type Row } from './queue.js'

const row = (s: string, first: number, over: Partial<Row> = {}): Row => ({
  s, v: 'v1', first, last: first, pageviews: 1, engaged: false, entryPath: '/', country: null, region: null, city: null,
  device: 'Desktop', browser: 'Chrome', os: 'macOS', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
  events: [{ at: first, type: 'page_view', path: '/', props: {} }], ...over,
})

// Just enough of Upstash's list and SET NX behaviour for the queue.
function fakeRedis() {
  let list: unknown[] = []
  const keys = new Set<string>()
  const r = {
    rpush: async (_k: string, v: unknown) => list.push(structuredClone(v)),
    lrange: async (_k: string, a: number, b: number) => list.slice(a, b + 1),
    ltrim: async (_k: string, a: number, b: number) => { list = list.slice(a, b === -1 ? undefined : b + 1) },
    set: async (k: string, _v: unknown, o: { nx: boolean }) => (o.nx && keys.has(k) ? null : (keys.add(k), 'OK')),
    del: async (k: string) => keys.delete(k),
  }
  return { r: r as unknown as Redis, size: () => list.length }
}

const fakeSql = (fail = false) => {
  const calls: string[] = []
  const sql = ((strings: TemplateStringsArray) => {
    if (fail) return Promise.reject(new Error('402 quota'))
    calls.push(strings.join('?').trim().split(/\s+/).slice(0, 3).join(' '))
    return Promise.resolve([])
  }) as unknown as Sql
  return { sql, calls }
}

describe('tracker queue', () => {
  it('merges repeat rows of a visit into one session update', () => {
    const [m, ...rest] = mergeSessions([row('a', 20, { pageviews: 0, engaged: true, entryPath: '/tv' }), row('a', 10), row('b', 5)])
      .sort((x, y) => x.s.localeCompare(y.s))
    expect(rest).toHaveLength(1)
    expect(m).toMatchObject({ first: 10, last: 20, pageviews: 1, engaged: true, entryPath: '/' })
  })

  it('moves queued rows into Postgres and empties the queue', async () => {
    const { r, size } = fakeRedis()
    for (let i = 0; i < 3; i++) await enqueue(r, row(`s${i}`, i))
    const { sql, calls } = fakeSql()
    expect(await flush(r, sql)).toBe(3)
    expect(size()).toBe(0)
    expect(calls).toEqual(['INSERT INTO sessions', 'INSERT INTO events'])
  })

  it('keeps rows when Postgres refuses the write, and releases the lock for the next try', async () => {
    const { r, size } = fakeRedis()
    await enqueue(r, row('a', 1))
    await expect(flush(r, fakeSql(true).sql)).rejects.toThrow('402')
    expect(size()).toBe(1)
    expect(await flush(r, fakeSql().sql)).toBe(1)
  })

  it('hands the due flush to one caller per interval', async () => {
    const { r } = fakeRedis()
    expect(await flushDue(r)).toBe(true)
    expect(await flushDue(r)).toBe(false)
  })
})
