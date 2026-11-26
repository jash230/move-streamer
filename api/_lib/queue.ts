// Tracker writes go to a Redis list first and reach Postgres in batches, so Neon's compute can sleep
// between flushes instead of waking for every 2-minute heartbeat from every open tab.
// Without Redis, rows are written straight to Postgres as before.
import type { Redis } from '@upstash/redis'
import type { Sql } from './db.js'

export interface Row {
  s: string
  v: string
  first: number
  last: number
  pageviews: number
  engaged: boolean
  entryPath: string
  country: string | null
  region: string | null
  city: string | null
  device: string
  browser: string
  os: string
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  events: { at: number; type: string; path: string; props: object }[]
}

const QUEUE = 'e:queue'
const LOCK = 'e:flush'
const DUE = 'e:due'
const CHUNK = 500
const MAX_QUEUE = 200_000 // shortcut: oldest rows are dropped past this, if Postgres stays down for days

export async function enqueue(r: Redis, row: Row) {
  const n = await r.rpush(QUEUE, row)
  if (n > MAX_QUEUE) await r.ltrim(QUEUE, -MAX_QUEUE, -1)
}

// Merge rows of the same visit so one upsert touches each session once (Postgres rejects repeats).
export function mergeSessions(rows: Row[]) {
  const by = new Map<string, Row>()
  for (const x of [...rows].sort((a, b) => a.first - b.first)) {
    const m = by.get(x.s)
    if (!m) by.set(x.s, { ...x })
    else {
      m.last = Math.max(m.last, x.last)
      m.pageviews += x.pageviews
      m.engaged ||= x.engaged
    }
  }
  return [...by.values()]
}

export async function write(sql: Sql, rows: Row[]) {
  const s = mergeSessions(rows)
  const col = <K extends keyof Row>(k: K) => s.map((x) => x[k])
  await sql`
    INSERT INTO sessions (id, visitor_id, started_at, last_seen, pageviews, engaged, entry_path,
      country, region, city, device, browser, os, referrer, utm_source, utm_medium, utm_campaign)
    SELECT * FROM unnest(${col('s')}::text[], ${col('v')}::text[],
      ${s.map((x) => new Date(x.first).toISOString())}::timestamptz[], ${s.map((x) => new Date(x.last).toISOString())}::timestamptz[],
      ${col('pageviews')}::int[], ${col('engaged')}::bool[], ${col('entryPath')}::text[],
      ${col('country')}::text[], ${col('region')}::text[], ${col('city')}::text[],
      ${col('device')}::text[], ${col('browser')}::text[], ${col('os')}::text[], ${col('referrer')}::text[],
      ${col('utmSource')}::text[], ${col('utmMedium')}::text[], ${col('utmCampaign')}::text[])
    ON CONFLICT (id) DO UPDATE SET
      last_seen = GREATEST(sessions.last_seen, EXCLUDED.last_seen),
      pageviews = sessions.pageviews + EXCLUDED.pageviews,
      engaged = sessions.engaged OR EXCLUDED.engaged OR sessions.pageviews + EXCLUDED.pageviews > 1`

  const ev = rows.flatMap((x) => x.events.map((e) => ({ ...e, s: x.s, v: x.v })))
  if (!ev.length) return
  await sql`
    INSERT INTO events (session_id, visitor_id, at, type, path, props)
    SELECT * FROM unnest(${ev.map((e) => e.s)}::text[], ${ev.map((e) => e.v)}::text[],
      ${ev.map((e) => new Date(e.at).toISOString())}::timestamptz[], ${ev.map((e) => e.type)}::text[],
      ${ev.map((e) => e.path)}::text[], ${ev.map((e) => JSON.stringify(e.props))}::jsonb[])`
}

// Moves everything queued into Postgres. A row leaves Redis only after its chunk is written,
// so a failed flush (Neon down or over quota) keeps the data for the next try.
export async function flush(r: Redis, sql: Sql) {
  if (!(await r.set(LOCK, 1, { nx: true, ex: 120 }))) return 0
  let moved = 0
  try {
    for (;;) {
      const rows = await r.lrange<Row>(QUEUE, 0, CHUNK - 1)
      if (!rows.length) break
      await write(sql, rows)
      await r.ltrim(QUEUE, rows.length, -1)
      moved += rows.length
    }
  } finally {
    await r.del(LOCK)
  }
  return moved
}

// True at most once per interval across all instances: the caller that gets it does the flush.
export const flushDue = async (r: Redis, seconds = 3600) => (await r.set(DUE, 1, { nx: true, ex: seconds })) === 'OK'
