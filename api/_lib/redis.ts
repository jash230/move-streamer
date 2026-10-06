import { Redis } from '@upstash/redis'

// Vercel's Upstash integration sets KV_*; a manual Upstash setup uses UPSTASH_*.
export function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

// Fixed-window limit per key. Without Redis the limit is skipped rather than blocking traffic.
export async function overLimit(key: string, max: number, windowSeconds: number) {
  const r = redis()
  if (!r) return false
  const count = await r.incr(key)
  if (count === 1) await r.expire(key, windowSeconds)
  return count > max
}

export const clientIp = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
