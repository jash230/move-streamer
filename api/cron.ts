// Nightly cleanup (see the cron-cleanup Netlify Function). Visits are kept forever; raw events are kept 90 days
// so the database stays inside Neon's free storage.
import { db } from './_lib/db.js'
import { error, json } from './_lib/http.js'
import { flush } from './_lib/queue.js'
import { redis } from './_lib/redis.js'

export async function cleanup() {
  const sql = await db()
  if (!sql) return error('Database is not connected', 503)
  const r = redis()
  const flushed = r ? await flush(r, sql) : 0
  const [{ n }] = await sql`WITH d AS (DELETE FROM events WHERE at < now() - interval '90 days' RETURNING 1) SELECT count(*)::int AS n FROM d`
  return json({ flushed, deletedEvents: n })
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return error('Not allowed', 401)
  return cleanup()
}
