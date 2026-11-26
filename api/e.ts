// First-party tracker. Receives batched events from src/analytics.ts, adds location and device,
// and queues the visit (session) update plus every event except heartbeats; see _lib/queue.ts.
import { db } from './_lib/db.js'
import { error } from './_lib/http.js'
import { parseBatch, parseUA, referrerHost, summarize } from './_lib/ingest.js'
import { enqueue, flush, flushDue, write, type Row } from './_lib/queue.js'
import { clientIp, overLimit, redis } from './_lib/redis.js'

const MAX_BODY = 16_000
const header = (request: Request, name: string) => {
  const v = request.headers.get(name)
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}
// Vercel sets x-vercel-ip-* itself; the Netlify adapter passes geo as x-site-*.
const geo = (request: Request, site: string, vercel: string) => header(request, `x-vercel-ip-${vercel}`) ?? header(request, `x-site-${site}`)

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

  const s = summarize(batch.e)
  const host = request.headers.get('host') ?? new URL(request.url).host
  const row: Row = {
    s: batch.s, v: batch.v, first: s.first, last: s.last, pageviews: s.pageviews, engaged: s.engaged, entryPath: s.entryPath,
    country: geo(request, 'country', 'country'), region: geo(request, 'region', 'country-region'), city: geo(request, 'city', 'city'),
    device: ua.device, browser: ua.browser, os: ua.os, referrer: referrerHost(batch.r, host),
    utmSource: batch.u?.source ?? null, utmMedium: batch.u?.medium ?? null, utmCampaign: batch.u?.campaign ?? null,
    events: batch.e.filter((e) => e.t !== 'heartbeat').map((e) => ({ at: e.at, type: e.t, path: e.p, props: e.d ?? {} })),
  }

  const r = redis()
  if (!r) {
    const sql = await db()
    if (!sql) return error('Database is not connected', 503)
    await write(sql, [row])
    return new Response(null, { status: 204 })
  }
  await enqueue(r, row)
  // Heartbeats never trigger a flush, so they cost two Redis commands and no Postgres time.
  if (row.events.length && (await flushDue(r))) {
    // The row is safe in Redis either way; a failed flush is retried on the next due request.
    await db().then((sql) => sql && flush(r, sql)).catch((e) => console.error('Tracker flush failed:', e))
  }
  return new Response(null, { status: 204 })
}
