// Runs the tracker and every admin report against a real Postgres engine (PGlite, in memory),
// so the SQL is exercised end to end. Neon's driver is swapped for a PGlite adapter; auth is stubbed.
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const pg = new PGlite()

class Raw {
  text: string
  constructor(text: string) {
    this.text = text
  }
}

function adapter() {
  const run = async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as Record<string, unknown>[]
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    const params: unknown[] = []
    values.forEach((v, i) => {
      if (v instanceof Raw) text += v.text
      else text += `$${params.push(v instanceof Date ? v.toISOString() : v)}`
      text += strings[i + 1]
    })
    return run(text, params)
  }
  sql.query = run
  sql.unsafe = (text: string) => new Raw(text)
  sql.transaction = async (queries: Promise<unknown>[]) => {
    const out = []
    for (const q of queries) out.push(await q)
    return out
  }
  return sql
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => adapter() }))
vi.mock('./auth.js', () => ({ requireAdmin: async () => null }))

const { POST: ingest } = await import('../e.js')
const { GET: admin } = await import('../admin.js')
const { POST: review } = await import('../reviews.js')
const { GET: cron } = await import('../cron.js')

const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function send(body: object, ua = DESKTOP, geo: Record<string, string> = {}) {
  return ingest(new Request('https://cucuflix.test/api/e', {
    method: 'POST',
    headers: { 'user-agent': ua, host: 'cucuflix.test', ...geo },
    body: JSON.stringify(body),
  }))
}

async function report<T = Record<string, any>>(name: string, extra = '') {
  const res = await admin(new Request(`https://cucuflix.test/api/admin?report=${name}&range=7d${extra}`))
  const body = await res.json()
  if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(body)}`)
  return body.data as T
}

const now = Date.now()
const TLV = { 'x-vercel-ip-country': 'IL', 'x-vercel-ip-city': 'Tel%20Aviv', 'x-vercel-ip-country-region': 'TA' }

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite://memory'
  process.env.ADMIN_TZ = 'Asia/Jerusalem'

  // Visitor A: lands on the home page and leaves (a bounce).
  expect((await send({ v: 'visitorAAAA', s: 'sessionA1111', r: 'https://www.google.com/', e: [
    { t: 'page_view', p: '/', at: now - 60_000 },
    { t: 'heartbeat', p: '/', at: now - 30_000 },
  ] }, PHONE, TLV)).status).toBe(204)

  // Visitor B: opens a show, plays it on one server, gives up, switches, finishes, searches.
  await send({ v: 'visitorBBBB', s: 'sessionB1111', u: { source: 'instagram', campaign: 'bio' }, e: [
    { t: 'page_view', p: '/', at: now - 50_000 },
    { t: 'page_view', p: '/tv/1399', at: now - 45_000 },
    { t: 'title_view', p: '/tv/1399', at: now - 44_000, d: { id: '1399', mt: 'tv', title: 'Game of Thrones' } },
    { t: 'play_start', p: '/tv/1399', at: now - 40_000, d: { id: '1399', mt: 'tv', title: 'Game of Thrones', s: 1, e: 1, server: 'vidsrc' } },
    { t: 'server_switch', p: '/tv/1399', at: now - 35_000, d: { from: 'vidsrc', to: 'vidzee', reason: 'try_next', playing: true } },
    { t: 'play_start', p: '/tv/1399', at: now - 34_000, d: { id: '1399', mt: 'tv', title: 'Game of Thrones', s: 1, e: 1, server: 'vidzee' } },
  ] }, DESKTOP, { 'x-vercel-ip-country': 'US', 'x-vercel-ip-city': 'Austin' })
  // A second batch for the same visit: finishes, then a search that finds nothing.
  await send({ v: 'visitorBBBB', s: 'sessionB1111', e: [
    { t: 'play_finish', p: '/tv/1399', at: now - 20_000, d: { id: '1399', mt: 'tv', title: 'Game of Thrones', s: 1, e: 1, server: 'vidzee' } },
    { t: 'page_view', p: '/search', at: now - 10_000 },
    { t: 'search', p: '/search', at: now - 10_000, d: { q: 'Shtisel Season 9', results: 0 } },
  ] }, DESKTOP, { 'x-vercel-ip-country': 'US', 'x-vercel-ip-city': 'Austin' })

  // Visitor C first came 3 days ago and returned the next day (written directly: the tracker clamps old timestamps).
  await pg.query(`INSERT INTO sessions (id, visitor_id, started_at, last_seen, pageviews, engaged, entry_path, country)
    VALUES ('sessionC1111', 'visitorCCCC', now() - interval '3 days', now() - interval '3 days' + interval '5 minutes', 3, true, '/movies', 'IL'),
           ('sessionC2222', 'visitorCCCC', now() - interval '2 days', now() - interval '2 days' + interval '1 minute', 1, false, '/', 'IL')`)
})

describe('tracker + reports on real Postgres', () => {
  it('drops bots and rejects junk', async () => {
    expect((await send({ v: 'botbotbot1', s: 'botbotbot1', e: [{ t: 'page_view', p: '/', at: now }] }, 'Googlebot/2.1')).status).toBe(204)
    expect((await send({ v: 'x', s: 'y', e: [] })).status).toBe(400)
    const [{ n }] = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM sessions WHERE id = 'botbotbot1'`)).rows
    expect(n).toBe(0)
  })

  it('stores visits with location, device and source', async () => {
    const { rows } = await pg.query<Record<string, unknown>>(`SELECT * FROM sessions WHERE id IN ('sessionA1111', 'sessionB1111') ORDER BY id`)
    expect(rows[0]).toMatchObject({ country: 'IL', city: 'Tel Aviv', device: 'Mobile', browser: 'Safari', referrer: 'google.com', pageviews: 1, engaged: false })
    expect(rows[1]).toMatchObject({ country: 'US', device: 'Desktop', browser: 'Chrome', utm_source: 'instagram', utm_campaign: 'bio', pageviews: 3, engaged: true })
  })

  it('overview: counts, bounce rate, plays and trend', async () => {
    const d = await report('overview')
    expect(d.current).toMatchObject({ visitors: 3, visits: 4, pageviews: 8, plays: 2 })
    // Bounces: visitor A's home-only visit and visitor C's second visit.
    expect(d.current.bounceRate).toBeCloseTo(2 / 4)
    expect(d.previous).toMatchObject({ visitors: 0, visits: 0 })
    expect(d.series.length).toBeGreaterThanOrEqual(7)
    expect(d.series.reduce((s: number, p: { plays: number }) => s + p.plays, 0)).toBe(2)
    expect(d.countries[0]).toMatchObject({ label: 'IL', visitors: 2 })
  })

  it('live: who is here right now and what they are doing', async () => {
    const d = await report('live')
    expect(d.total).toBe(2)
    expect(d.people.map((p: { type: string }) => p.type).sort()).toEqual(['page_view', 'page_view'])
  })

  it('audience: breakdowns, new vs returning and retention', async () => {
    const d = await report('audience')
    expect(d.devices.map((r: { label: string }) => r.label).sort()).toEqual(['Desktop', 'Mobile', null].sort())
    expect(d.sources.find((r: { label: string }) => r.label === 'google.com').visitors).toBe(1)
    expect(d.campaigns[0]).toMatchObject({ source: 'instagram', campaign: 'bio', visitors: 1 })
    expect(d.split).toEqual({ new: 3, returning: 0 })
    expect(d.retention).toEqual({ cohort: 3, day1: 1, day7: 1, day30: 1 })
  })

  it('watching: funnel, titles and searches', async () => {
    const d = await report('watching')
    expect(d.funnel).toEqual({ visits: 4, opened: 1, played: 1, finished: 1 })
    expect(d.titles[0]).toMatchObject({ id: '1399', type: 'tv', title: 'Game of Thrones', plays: 2, finishes: 1, viewers: 1 })
    expect(d.opened[0]).toMatchObject({ title: 'Game of Thrones', visitors: 1 })
    expect(d.searches[0]).toMatchObject({ query: 'shtisel season 9', searches: 1, results: 0 })
    expect(d.empty[0]).toMatchObject({ query: 'shtisel season 9' })
  })

  it('playback: per-server plays, finishes and switches', async () => {
    const d = await report('playback')
    expect(d.servers).toEqual(expect.arrayContaining([
      { server: 'vidsrc', plays: 1, finishes: 0, switches: 1, try_next: 1 },
      { server: 'vidzee', plays: 1, finishes: 1, switches: 0, try_next: 0 },
    ]))
  })

  it('visitors and journey', async () => {
    const d = await report('visitors')
    expect(d.visits.map((v: { id: string }) => v.id)).toEqual(['sessionA1111', 'sessionB1111', 'sessionC2222', 'sessionC1111'].sort((a, b) =>
      d.visits.findIndex((v: { id: string }) => v.id === a) - d.visits.findIndex((v: { id: string }) => v.id === b)))
    const c2 = d.visits.find((v: { id: string }) => v.id === 'sessionC2222')
    expect(c2).toMatchObject({ returning: true, bounced: true })
    const j = await report('journey', '&session=sessionB1111')
    expect(j.visit).toMatchObject({ id: 'sessionB1111', visits_by_visitor: 1, bounced: false })
    expect(j.steps.map((s: { type: string }) => s.type)).toEqual(['page_view', 'page_view', 'title_view', 'play_start', 'server_switch', 'play_start', 'play_finish', 'page_view', 'search'])
    await expect(report('journey', '&session=bad id')).rejects.toThrow('404')
  })

  it('reviews: posted, summarized and listed', async () => {
    const post = (rating: number, comment: string) => review(new Request('https://cucuflix.test/api/reviews', { method: 'POST', body: JSON.stringify({ rating, comment, name: 'Dana', page: '/' }) }))
    expect((await post(5, 'Love it')).status).toBe(201)
    expect((await post(4, '')).status).toBe(201)
    expect((await post(9, 'nope')).status).toBe(400)
    const d = await report('reviews')
    expect(d.summary).toEqual({ total: 2, average: 4.5 })
    expect(d.reviews[0]).toMatchObject({ rating: 4, name: 'Dana' })
    expect((await report('overview')).reviews).toHaveLength(2)
  })

  it('today and all-time ranges work', async () => {
    const res = await admin(new Request('https://cucuflix.test/api/admin?report=overview&range=today'))
    const { data } = await res.json()
    expect(data.unit).toBe('hour')
    const all = await (await admin(new Request('https://cucuflix.test/api/admin?report=overview&range=all'))).json()
    expect(all.data.previous).toBeNull()
    expect(all.data.current.visits).toBe(4)
  })

  it('cron needs the secret and trims old events only', async () => {
    process.env.CRON_SECRET = 's3cret'
    await pg.query(`INSERT INTO events (session_id, visitor_id, at, type, path) VALUES ('old', 'old', now() - interval '100 days', 'page_view', '/')`)
    expect((await cron(new Request('https://cucuflix.test/api/cron'))).status).toBe(401)
    const res = await cron(new Request('https://cucuflix.test/api/cron', { headers: { authorization: 'Bearer s3cret' } }))
    expect(await res.json()).toEqual({ deletedEvents: 1 })
  })
})
