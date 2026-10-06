// Site reviews. POST is public (anyone can leave one); GET is private and needs REVIEWS_ADMIN_KEY.
import { Redis } from '@upstash/redis'

const LIST = 'reviews'
const MAX_COMMENT = 1000
const MAX_NAME = 60
const PER_HOUR = 5

// Vercel's Upstash integration sets KV_*; a manual Upstash setup uses UPSTASH_*.
function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export interface Review {
  rating: number
  comment: string
  name: string
  page: string
  at: string
}

export async function POST(request: Request) {
  const db = redis()
  if (!db) return error('Reviews storage is not connected', 503)

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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limitKey = `reviews:limit:${ip}`
  const count = await db.incr(limitKey)
  if (count === 1) await db.expire(limitKey, 3600)
  if (count > PER_HOUR) return error('Too many reviews from you, try again later', 429)

  const review: Review = { rating, comment, name, page, at: new Date().toISOString() }
  await db.lpush(LIST, JSON.stringify(review))
  return Response.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  const admin = process.env.REVIEWS_ADMIN_KEY
  const key = request.headers.get('x-admin-key')
  if (!admin || key !== admin) return error('Not allowed', 401)
  const db = redis()
  if (!db) return error('Reviews storage is not connected', 503)

  const raw = await db.lrange<Review | string>(LIST, 0, 499)
  // Upstash auto-parses JSON strings, so entries can arrive as objects or strings.
  const reviews = raw.map((r) => (typeof r === 'string' ? (JSON.parse(r) as Review) : r))
  return Response.json({ reviews, total: await db.llen(LIST) }, { headers: { 'Cache-Control': 'no-store' } })
}
