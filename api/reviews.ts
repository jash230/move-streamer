// Site reviews. Anyone can leave one; reading them happens in the admin dashboard (/api/admin?report=reviews).
import { db } from './_lib/db.js'
import { error, json } from './_lib/http.js'
import { clientIp, overLimit } from './_lib/redis.js'

const MAX_COMMENT = 1000
const MAX_NAME = 60
const PER_HOUR = 5

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return error('Invalid JSON', 400)
  }
  const rating = Number(body.rating)
  const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : ''
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return error('Rating must be 1 to 5 stars', 400)
  if (comment.length > MAX_COMMENT) return error(`Keep it under ${MAX_COMMENT} characters`, 400)
  if (name.length > MAX_NAME) return error(`Name must be under ${MAX_NAME} characters`, 400)

  if (await overLimit(`reviews:limit:${clientIp(request)}`, PER_HOUR, 3600)) return error('Too many reviews from you, try again later', 429)
  const sql = await db()
  if (!sql) return error('Reviews storage is not connected', 503)

  await sql`INSERT INTO reviews (rating, comment, name, page) VALUES (${rating}, ${comment}, ${name}, ${page})`
  return json({ ok: true }, 201)
}
