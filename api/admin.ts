// Admin dashboard data. One function serves every report (?report=…&range=…) to stay under
// Vercel Hobby's function limit. Every request is checked against Clerk + ADMIN_USER_IDS.
import { requireAdmin } from './_lib/auth.js'
import { db, type Sql } from './_lib/db.js'
import { error, json } from './_lib/http.js'
import { resolveRange, type Range } from './_lib/range.js'
import { redis } from './_lib/redis.js'
import { vercelTraffic, type VercelTraffic } from './_lib/vercel.js'

// Day boundaries; UTC matches Vercel Analytics, so both sources cover the same days.
const TZ = process.env.ADMIN_TZ ?? 'UTC'
const ID = /^[A-Za-z0-9_-]{8,64}$/

type Ctx = { sql: Sql; r: Range; url: URL; now: Date }
type Window = { from: Date; to: Date }

async function stats(sql: Sql, { from, to }: Window) {
  const [s] = await sql`
    SELECT count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS visits,
      coalesce(sum(pageviews), 0)::int AS pageviews,
      count(*) FILTER (WHERE entry_path = '/' AND NOT engaged)::int AS bounces,
      coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM last_seen - started_at)), 0)::float8 AS typical_seconds
    FROM sessions WHERE started_at >= ${from} AND started_at < ${to}`
  const [p] = await sql`SELECT count(*)::int AS plays FROM events WHERE type = 'play_start' AND at >= ${from} AND at < ${to}`
  return {
    visitors: s.visitors as number,
    visits: s.visits as number,
    pageviews: s.pageviews as number,
    bounceRate: s.visits ? (s.bounces as number) / (s.visits as number) : 0,
    typicalSeconds: Math.round(s.typical_seconds as number),
    plays: p.plays as number,
  }
}

// Columns a breakdown may group by. Only these names are ever interpolated into SQL.
const COLUMNS = { country: 'country', region: 'region', device: 'device', browser: 'browser', os: 'os', referrer: 'referrer', utm_source: 'utm_source', utm_campaign: 'utm_campaign' } as const

async function breakdown(sql: Sql, column: keyof typeof COLUMNS, { from, to }: Window, limit = 10) {
  return sql`
    SELECT ${sql.unsafe(COLUMNS[column])} AS label, count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS visits
    FROM sessions WHERE started_at >= ${from} AND started_at < ${to}
    GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`
}

const cities = (sql: Sql, { from, to }: Window, limit = 10) => sql`
  SELECT city AS label, country, count(DISTINCT visitor_id)::int AS visitors, count(*)::int AS visits
  FROM sessions WHERE started_at >= ${from} AND started_at < ${to} AND city IS NOT NULL
  GROUP BY 1, 2 ORDER BY 3 DESC LIMIT ${limit}`

async function trend(sql: Sql, r: Range) {
  return sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${r.unit}, ${r.from}::timestamptz AT TIME ZONE ${TZ}),
        date_trunc(${r.unit}, ${r.to}::timestamptz AT TIME ZONE ${TZ}),
        ('1 ' || ${r.unit})::interval) AS b
    ), s AS (
      SELECT date_trunc(${r.unit}, started_at AT TIME ZONE ${TZ}) AS b, count(DISTINCT visitor_id)::int AS visitors, sum(pageviews)::int AS pageviews
      FROM sessions WHERE started_at >= ${r.from} AND started_at < ${r.to} GROUP BY 1
    ), p AS (
      SELECT date_trunc(${r.unit}, at AT TIME ZONE ${TZ}) AS b, count(*)::int AS plays
      FROM events WHERE type = 'play_start' AND at >= ${r.from} AND at < ${r.to} GROUP BY 1
    )
    SELECT to_char(buckets.b, 'YYYY-MM-DD"T"HH24:MI') AS t,
      coalesce(s.visitors, 0) AS visitors, coalesce(s.pageviews, 0) AS pageviews, coalesce(p.plays, 0) AS plays
    FROM buckets LEFT JOIN s USING (b) LEFT JOIN p USING (b) ORDER BY 1`
}

// Reviews used to live in a Redis list; copy them over once so nothing is lost.
async function migrateRedisReviews(sql: Sql) {
  const r = redis()
  if (!r || (await r.get('reviews:migrated'))) return
  const raw = await r.lrange<Record<string, unknown> | string>('reviews', 0, -1)
  const old = raw.map((x) => (typeof x === 'string' ? (JSON.parse(x) as Record<string, unknown>) : x))
  if (old.length) {
    await sql`
      INSERT INTO reviews (at, rating, comment, name, page)
      SELECT * FROM unnest(${old.map((o) => String(o.at))}::timestamptz[], ${old.map((o) => Number(o.rating))}::int[],
        ${old.map((o) => String(o.comment ?? ''))}::text[], ${old.map((o) => String(o.name ?? ''))}::text[], ${old.map((o) => String(o.page ?? ''))}::text[])`
  }
  await r.set('reviews:migrated', new Date().toISOString())
}

const reviewList = (sql: Sql, { from, to }: Window, limit: number) => sql`
  SELECT id::text, at, rating, comment, name, page FROM reviews WHERE at >= ${from} AND at < ${to} ORDER BY at DESC, id DESC LIMIT ${limit}`

// Vercel's numbers when it's connected; otherwise a note saying why our own count is shown instead.
async function traffic(r: Range, now: Date): Promise<VercelTraffic | { note: string }> {
  try {
    return (await vercelTraffic(r, now)) ?? { note: 'Vercel Analytics is not connected (VERCEL_TOKEN is not set), so these are Cucuflix\'s own counts.' }
  } catch (e) {
    console.error('[admin] Vercel Analytics:', e)
    return { note: `Couldn't reach Vercel Analytics (${(e as Error).message}), so these are Cucuflix's own counts.` }
  }
}

const REPORTS: Record<string, (c: Ctx) => Promise<unknown>> = {
  async live({ sql }) {
    const rows = await sql`
      SELECT s.country, s.city, s.device, e.type, e.path, e.props->>'title' AS title
      FROM sessions s
      LEFT JOIN LATERAL (
        SELECT type, path, props FROM events
        WHERE session_id = s.id AND type IN ('page_view', 'title_view', 'play_start', 'play_finish')
        ORDER BY at DESC LIMIT 1
      ) e ON true
      WHERE s.last_seen > now() - interval '2 minutes'
      ORDER BY s.last_seen DESC LIMIT 100`
    return { total: rows.length, watching: rows.filter((x) => x.type === 'play_start').length, people: rows }
  },

  async overview({ sql, r, now }) {
    await migrateRedisReviews(sql)
    const [current, previous, series, countries, topCities, reviews, vercel] = await Promise.all([
      stats(sql, r),
      r.prev ? stats(sql, r.prev) : null,
      trend(sql, r),
      breakdown(sql, 'country', r, 6),
      cities(sql, r, 6),
      reviewList(sql, r, 3),
      traffic(r, now),
    ])
    if (!('current' in vercel)) {
      return { current, previous, unit: r.unit, series, countries, cities: topCities, reviews, source: 'cucuflix', sourceNote: vercel.note }
    }
    // Visitors, page views, the trend and countries come from Vercel; plays, bounce rate and visit length are ours.
    const plays = new Map(series.map((p) => [p.t as string, p.plays as number]))
    return {
      current: { ...current, ...vercel.current },
      previous: previous && vercel.previous ? { ...previous, ...vercel.previous } : r.unit === 'hour' ? null : previous,
      unit: r.unit,
      series: vercel.series.map((p) => ({ ...p, plays: plays.get(p.t) ?? 0 })),
      countries: vercel.countries.slice(0, 6),
      cities: topCities,
      reviews,
      source: 'vercel',
      coveredDays: vercel.coveredDays,
    }
  },

  async audience({ sql, r, now }) {
    const [ownCountries, topCities, devices, browsers, systems, sources, campaigns, [split], [retention]] = await Promise.all([
      breakdown(sql, 'country', r),
      cities(sql, r),
      breakdown(sql, 'device', r),
      breakdown(sql, 'browser', r),
      breakdown(sql, 'os', r),
      breakdown(sql, 'referrer', r),
      sql`
        SELECT utm_source AS source, utm_campaign AS campaign, count(DISTINCT visitor_id)::int AS visitors
        FROM sessions WHERE started_at >= ${r.from} AND started_at < ${r.to} AND (utm_source IS NOT NULL OR utm_campaign IS NOT NULL)
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10`,
      sql`
        WITH firsts AS (SELECT visitor_id, min(started_at) AS first FROM sessions GROUP BY visitor_id)
        SELECT count(DISTINCT s.visitor_id) FILTER (WHERE f.first >= ${r.from})::int AS new,
          count(DISTINCT s.visitor_id) FILTER (WHERE f.first < ${r.from})::int AS returning
        FROM sessions s JOIN firsts f USING (visitor_id)
        WHERE s.started_at >= ${r.from} AND s.started_at < ${r.to}`,
      sql`
        WITH cohort AS (
          SELECT visitor_id, min(started_at) AS first FROM sessions GROUP BY visitor_id
          HAVING min(started_at) >= ${r.from} AND min(started_at) < ${r.to}
        ), back AS (
          SELECT c.visitor_id, min(s.started_at - c.first) AS gap
          FROM cohort c JOIN sessions s ON s.visitor_id = c.visitor_id AND s.started_at > c.first + interval '30 minutes'
          GROUP BY 1
        )
        SELECT (SELECT count(*) FROM cohort)::int AS cohort,
          count(*) FILTER (WHERE gap <= interval '1 day')::int AS day1,
          count(*) FILTER (WHERE gap <= interval '7 days')::int AS day7,
          count(*) FILTER (WHERE gap <= interval '30 days')::int AS day30
        FROM back`,
    ])
    const vercel = await traffic(r, now)
    const countries = 'current' in vercel ? vercel.countries : ownCountries
    return { countries, cities: topCities, devices, browsers, systems, sources, campaigns, split, retention, source: 'current' in vercel ? 'vercel' : 'cucuflix' }
  },

  async watching({ sql, r }) {
    const [[funnel], titles, opened, searches, empty] = await Promise.all([
      sql`
        WITH f AS (
          SELECT session_id,
            bool_or(type = 'title_view') AS opened, bool_or(type = 'play_start') AS played, bool_or(type = 'play_finish') AS finished
          FROM events WHERE at >= ${r.from} GROUP BY 1
        )
        SELECT count(*)::int AS visits, count(*) FILTER (WHERE f.opened)::int AS opened,
          count(*) FILTER (WHERE f.played)::int AS played, count(*) FILTER (WHERE f.finished)::int AS finished
        FROM sessions s LEFT JOIN f ON f.session_id = s.id
        WHERE s.started_at >= ${r.from} AND s.started_at < ${r.to}`,
      sql`
        SELECT props->>'id' AS id, props->>'mt' AS type, max(props->>'title') AS title,
          count(*) FILTER (WHERE type = 'play_start')::int AS plays,
          count(*) FILTER (WHERE type = 'play_finish')::int AS finishes,
          count(DISTINCT visitor_id) FILTER (WHERE type = 'play_start')::int AS viewers
        FROM events WHERE type IN ('play_start', 'play_finish') AND at >= ${r.from} AND at < ${r.to}
        GROUP BY 1, 2 ORDER BY plays DESC LIMIT 15`,
      sql`
        SELECT props->>'id' AS id, props->>'mt' AS type, max(props->>'title') AS title, count(DISTINCT visitor_id)::int AS visitors
        FROM events WHERE type = 'title_view' AND at >= ${r.from} AND at < ${r.to}
        GROUP BY 1, 2 ORDER BY 4 DESC LIMIT 15`,
      sql`
        SELECT lower(trim(props->>'q')) AS query, count(*)::int AS searches, max((props->>'results')::int) AS results
        FROM events WHERE type = 'search' AND at >= ${r.from} AND at < ${r.to} AND props ? 'q'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      sql`
        SELECT lower(trim(props->>'q')) AS query, count(*)::int AS searches
        FROM events WHERE type = 'search' AND at >= ${r.from} AND at < ${r.to} AND (props->>'results')::int = 0
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
    ])
    return { funnel, titles, opened, searches, empty }
  },

  async playback({ sql, r }) {
    const servers = await sql`
      WITH plays AS (
        SELECT props->>'server' AS server, count(*) FILTER (WHERE type = 'play_start')::int AS plays,
          count(*) FILTER (WHERE type = 'play_finish')::int AS finishes
        FROM events WHERE type IN ('play_start', 'play_finish') AND at >= ${r.from} AND at < ${r.to} GROUP BY 1
      ), switches AS (
        SELECT props->>'from' AS server, count(*)::int AS switches,
          count(*) FILTER (WHERE props->>'reason' = 'try_next')::int AS try_next
        FROM events WHERE type = 'server_switch' AND at >= ${r.from} AND at < ${r.to} GROUP BY 1
      )
      SELECT server, coalesce(plays, 0) AS plays, coalesce(finishes, 0) AS finishes,
        coalesce(switches, 0) AS switches, coalesce(try_next, 0) AS try_next
      FROM plays FULL JOIN switches USING (server)
      WHERE server IS NOT NULL ORDER BY plays DESC`
    return { servers }
  },

  async visitors({ sql, r, url }) {
    const before = url.searchParams.get('before')
    const cursor = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : r.to
    const visits = await sql`
      SELECT s.id, s.started_at, s.last_seen, s.pageviews, s.entry_path, s.country, s.city, s.device, s.browser, s.os,
        s.referrer, s.utm_source, (s.entry_path = '/' AND NOT s.engaged) AS bounced,
        EXISTS (SELECT 1 FROM sessions p WHERE p.visitor_id = s.visitor_id AND p.started_at < s.started_at) AS returning
      FROM sessions s
      WHERE s.started_at >= ${r.from} AND s.started_at < ${cursor}
      ORDER BY s.started_at DESC, s.id DESC LIMIT 50`
    return { visits }
  },

  async journey({ sql, url }) {
    const id = url.searchParams.get('session') ?? ''
    if (!ID.test(id)) return null
    const [visit] = await sql`
      SELECT id, visitor_id, started_at, last_seen, pageviews, entry_path, country, region, city, device, browser, os,
        referrer, utm_source, utm_medium, utm_campaign, (entry_path = '/' AND NOT engaged) AS bounced,
        (SELECT count(*) FROM sessions p WHERE p.visitor_id = sessions.visitor_id)::int AS visits_by_visitor
      FROM sessions WHERE id = ${id}`
    if (!visit) return null
    const steps = await sql`SELECT at, type, path, props FROM events WHERE session_id = ${id} ORDER BY at, id LIMIT 500`
    return { visit, steps }
  },

  async reviews({ sql, r }) {
    await migrateRedisReviews(sql)
    const [[summary], stars, list] = await Promise.all([
      sql`SELECT count(*)::int AS total, coalesce(avg(rating), 0)::float8 AS average FROM reviews WHERE at >= ${r.from} AND at < ${r.to}`,
      sql`SELECT rating, count(*)::int AS n FROM reviews WHERE at >= ${r.from} AND at < ${r.to} GROUP BY 1`,
      reviewList(sql, r, 500),
    ])
    return { summary, stars, reviews: list }
  },
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const url = new URL(request.url)
  const report = REPORTS[url.searchParams.get('report') ?? '']
  if (!report) return error('Unknown report', 400)
  const sql = await db()
  if (!sql) return error('Database is not connected. Add Neon from the Vercel Marketplace so DATABASE_URL is set.', 503)

  const [meta] = await sql`
    SELECT date_trunc('day', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ} AS midnight, now() AS now,
      least((SELECT min(started_at) FROM sessions), (SELECT min(at) FROM reviews)) AS first`
  // Windows end just after now so anything written this instant is included.
  const now = new Date(new Date(meta.now).getTime() + 1000)
  const r = resolveRange(url.searchParams.get('range') ?? '7d', now, new Date(meta.midnight), meta.first ? new Date(meta.first) : null)

  const data = await report({ sql, r, url, now })
  if (data === null) return error('Not found', 404)
  return json({ range: { from: r.from, to: r.to, unit: r.unit, tz: TZ }, data })
}
