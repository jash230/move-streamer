// Nightly cleanup (see vercel.json crons). Visits are kept forever; raw events are kept 90 days
// so the database stays inside Neon's free storage.
import { db } from './_lib/db.js'
import { error, json } from './_lib/http.js'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return error('Not allowed', 401)
  const sql = await db()
  if (!sql) return error('Database is not connected', 503)
  const [{ n }] = await sql`WITH d AS (DELETE FROM events WHERE at < now() - interval '90 days' RETURNING 1) SELECT count(*)::int AS n FROM d`
  return json({ deletedEvents: n })
}
