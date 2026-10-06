import { describe, expect, it, vi } from 'vitest'
import { resolveRange } from './range.js'
import { vercelQueries, vercelTraffic } from './vercel.js'

const now = new Date('2026-10-06T18:30:00Z')
const midnight = new Date('2026-10-06T00:00:00Z')
const env = { token: 't', projectId: 'prj_1', teamId: 'team_1' }

describe('vercelQueries', () => {
  it('asks for whole UTC days, through the end of today', () => {
    const q = vercelQueries(resolveRange('7d', now, midnight, null), now)
    expect(q.current).toEqual({ since: '2026-09-30', until: '2026-10-07' })
    expect(q.previous).toEqual({ since: '2026-09-23', until: '2026-09-30' })
    expect(q.by).toBe('day')
  })

  it('uses hours for today and has nothing to compare with', () => {
    const q = vercelQueries(resolveRange('today', now, midnight, null), now)
    expect(q.current).toEqual({ since: '2026-10-06', until: '2026-10-07' })
    expect(q.previous).toBeNull()
    expect(q.by).toBe('hour')
  })

  it('stays inside the 31 days the Hobby plan keeps, and says when it cut a range short', () => {
    const q = vercelQueries(resolveRange('90d', now, midnight, null), now)
    expect(q.current).toEqual({ since: '2026-09-06', until: '2026-10-07' })
    expect(q.previous).toBeNull()
    expect(q.clamped).toBe(true)
    const all = vercelQueries(resolveRange('all', now, midnight, null), now)
    expect(all.current.since).toBe('2026-09-06')
    expect(vercelQueries(resolveRange('7d', now, midnight, null), now).clamped).toBe(false)
  })

  it('drops the comparison when the previous period is older than Vercel keeps', () => {
    const q = vercelQueries(resolveRange('30d', now, midnight, null), now)
    expect(q.current).toEqual({ since: '2026-09-07', until: '2026-10-07' })
    expect(q.previous).toBeNull()
    expect(q.clamped).toBe(false)
  })

  it('allows longer history on paid plans', () => {
    const q = vercelQueries(resolveRange('90d', now, midnight, null), now, 400)
    expect(q.current.since).toBe('2026-07-09')
    expect(q.previous).toEqual({ since: '2026-04-10', until: '2026-07-09' })
    expect(q.by).toBe('day')
  })
})

function fakeFetch(handler: (url: URL) => unknown) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = new URL(String(input))
    return Response.json(handler(url))
  })
}

describe('vercelTraffic', () => {
  const r = resolveRange('7d', now, midnight, null)

  it('returns totals, previous totals, series and countries exactly as Vercel reports them', async () => {
    const fetch = fakeFetch((url) => {
      const by = url.searchParams.get('by')
      if (url.pathname.endsWith('/count')) {
        return { data: url.searchParams.get('since') === '2026-09-30' ? { visitors: 158, pageviews: 633 } : { visitors: 40, pageviews: 100 } }
      }
      if (by === 'day') return { data: [{ timestamp: '2026-10-05T00:00:00.000Z', visitors: 0, pageviews: 0 }, { timestamp: '2026-10-06T00:00:00.000Z', visitors: 158, pageviews: 633 }, { timestamp: '2026-10-07T00:00:00.000Z', visitors: 0, pageviews: 0 }] }
      if (by === 'country') return { data: [{ country: 'US', visitors: 67, pageviews: 278 }, { country: 'Others', visitors: 25, pageviews: 116 }] }
      throw new Error(`unexpected ${url}`)
    })
    const t = await vercelTraffic(r, now, { ...env, fetch })
    expect(t).toEqual({
      current: { visitors: 158, pageviews: 633 },
      previous: { visitors: 40, pageviews: 100 },
      series: [{ t: '2026-10-05T00:00', visitors: 0, pageviews: 0 }, { t: '2026-10-06T00:00', visitors: 158, pageviews: 633 }],
      coveredDays: null,
      countries: [{ label: 'US', visitors: 67, visits: 278 }, { label: null, visitors: 25, visits: 116 }],
    })
    const sent = new URL(String(fetch.mock.calls[0][0]))
    expect(sent.searchParams.get('projectId')).toBe('prj_1')
    expect(sent.searchParams.get('teamId')).toBe('team_1')
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer t' })
  })

  it('is null when no token is configured', async () => {
    expect(await vercelTraffic(r, now, { ...env, token: undefined })).toBeNull()
  })

  it('throws a readable error when Vercel refuses', async () => {
    const fetch = vi.fn(async () => Response.json({ error: { message: 'Not authorized' } }, { status: 403 }))
    await expect(vercelTraffic(r, now, { ...env, fetch })).rejects.toThrow(/Vercel Analytics answered 403: Not authorized/)
  })
})
