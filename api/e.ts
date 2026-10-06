// First-party tracker. Receives batched events from src/analytics.ts, adds location and device,
// updates the visit (session) row and stores every event except heartbeats.
import { db } from './_lib/db.js'
import { error } from './_lib/http.js'
import { parseBatch, parseUA, referrerHost, summarize } from './_lib/ingest.js'
import { clientIp, overLimit } from './_lib/redis.js'

const MAX_BODY = 16_000
const header = (request: Request, name: string) => {
  const v = request.headers.get(name)
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}

export async function POST(request: Request) {
  const ua = parseUA(request.headers.get('user-agent') ?? '')
  if (ua.bot) return new Response(null, { status: 204 })

  const text = await request.text()
  if (text.length > MAX_BODY) return error('Too large', 413)
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return error('Invalid JSON', 400) }
  const batch = parseBatch(raw, Date.now())
  if ('error' in batch) return error(batch.error, 400)

  if (await overLimit(`e:limit:${clientIp(request)}`, 400, 600)) return error('Slow down', 429)
  const sql = await db()
  if (!sql) return error('Database is not connected', 503)

  const s = summarize(batch.e)
  const host = request.headers.get('host') ?? new URL(request.url).host
  await sql`
    INSERT INTO sessions (id, visitor_id, started_at, last_seen, pageviews, engaged, entry_path,
      country, region, city, device, browser, os, referrer, utm_source, utm_medium, utm_campaign)
    VALUES (${batch.s}, ${batch.v}, ${new Date(s.first)}, ${new Date(s.last)}, ${s.pageviews}, ${s.engaged}, ${s.entryPath},
      ${header(request, 'x-vercel-ip-country')}, ${header(request, 'x-vercel-ip-country-region')}, ${header(request, 'x-vercel-ip-city')},
      ${ua.device}, ${ua.browser}, ${ua.os}, ${referrerHost(batch.r, host)},
      ${batch.u?.source ?? null}, ${batch.u?.medium ?? null}, ${batch.u?.campaign ?? null})
    ON CONFLICT (id) DO UPDATE SET
      last_seen = GREATEST(sessions.last_seen, EXCLUDED.last_seen),
      pageviews = sessions.pageviews + EXCLUDED.pageviews,
      engaged = sessions.engaged OR EXCLUDED.engaged OR sessions.pageviews + EXCLUDED.pageviews > 1`

  const events = batch.e.filter((e) => e.t !== 'heartbeat')
  if (events.length) {
    await sql`
      INSERT INTO events (session_id, visitor_id, at, type, path, props)
      SELECT ${batch.s}, ${batch.v}, x.at, x.type, x.path, x.props
      FROM unnest(${events.map((e) => new Date(e.at).toISOString())}::timestamptz[], ${events.map((e) => e.t)}::text[],
        ${events.map((e) => e.p)}::text[], ${events.map((e) => JSON.stringify(e.d ?? {}))}::jsonb[]) AS x(at, type, path, props)`
  }
  return new Response(null, { status: 204 })
}
