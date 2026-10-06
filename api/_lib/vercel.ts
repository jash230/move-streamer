// Visitors, page views and countries straight from Vercel Web Analytics, so the dashboard shows
// exactly what Vercel shows. Vercel counts whole UTC days and resets its visitor ID daily, so a
// person who visits on three days is three visitors — that's why its numbers differ from ours.
import type { Range } from './range.js'

const API = 'https://api.vercel.com/v1/query/web-analytics/visits'
const DAY = 86_400_000
const CACHE_MS = 60_000

export interface Totals { visitors: number; pageviews: number }
export interface VercelTraffic {
  current: Totals
  previous: Totals | null
  series: { t: string; visitors: number; pageviews: number }[]
  // How many days Vercel covered, when it had to cut the range short.
  coveredDays: number | null
  countries: { label: string | null; visitors: number; visits: number }[]
}

interface Options {
  token?: string
  // Days of history Vercel keeps: 31 on Hobby, longer on paid plans.
  keepDays?: number
  projectId?: string
  teamId?: string
  fetch?: typeof fetch
}

const day = (d: Date) => d.toISOString().slice(0, 10)
const span = (from: Date, to: Date) => ({ since: day(from), until: day(new Date(to.getTime() + DAY - 1)) })

// Vercel snaps `since`/`until` to whole days and treats `until` as exclusive, so ask for the day after today.
// Hobby projects only keep the latest 31 days, so ranges are cut to what Vercel can answer (`clamped`).
export function vercelQueries(r: Range, now: Date, keepDays = 31) {
  const earliest = new Date(Date.parse(day(now)) - (keepDays - 1) * DAY)
  const wanted = r.days === null ? new Date(now.getTime() - 365 * DAY) : r.from
  const from = wanted < earliest ? earliest : wanted
  const current = span(from, now)
  const previous = r.prev && r.unit === 'day' && r.prev.from >= earliest ? span(r.prev.from, new Date(r.prev.to.getTime() - 1)) : null
  const days = (now.getTime() - from.getTime()) / DAY
  const by = r.unit === 'hour' ? 'hour' : days > 95 ? 'week' : 'day'
  return { current, previous, by, clamped: wanted < earliest } as const
}

const cache = new Map<string, { at: number; value: Promise<unknown> }>()

export function fromEnv(): Options {
  return {
    token: process.env.VERCEL_TOKEN,
    projectId: process.env.VERCEL_ANALYTICS_PROJECT_ID ?? process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_ANALYTICS_TEAM_ID ?? process.env.VERCEL_TEAM_ID,
    keepDays: Number(process.env.VERCEL_ANALYTICS_DAYS) || undefined,
  }
}

export async function vercelTraffic(r: Range, now: Date, opts: Options = fromEnv()): Promise<VercelTraffic | null> {
  const { token, projectId, teamId } = opts
  if (!token || !projectId) return null
  const doFetch = opts.fetch ?? fetch

  const get = async <T>(endpoint: 'count' | 'aggregate', params: Record<string, string>): Promise<T> => {
    const qs = new URLSearchParams({ projectId, ...(teamId ? { teamId } : {}), ...params })
    const url = `${API}/${endpoint}?${qs}`
    const hit = cache.get(url)
    if (!opts.fetch && hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>
    const value = (async () => {
      const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string } }
      if (!res.ok) throw new Error(`Vercel Analytics answered ${res.status}: ${body.error?.message ?? res.statusText}`)
      return body.data as T
    })()
    if (!opts.fetch) cache.set(url, { at: Date.now(), value })
    value.catch(() => cache.delete(url))
    return value
  }

  const q = vercelQueries(r, now, opts.keepDays)
  const [current, previous, series, countries] = await Promise.all([
    get<Totals>('count', q.current),
    q.previous ? get<Totals>('count', q.previous) : null,
    get<{ timestamp: string; visitors: number; pageviews: number }[]>('aggregate', { ...q.current, by: q.by, limit: '100' }),
    get<{ country: string; visitors: number; pageviews: number }[]>('aggregate', { ...q.current, by: 'country', limit: '10' }),
  ])
  return {
    current: { visitors: current.visitors, pageviews: current.pageviews },
    previous: previous && { visitors: previous.visitors, pageviews: previous.pageviews },
    // `until` is inclusive for breakdowns, so drop the bucket for tomorrow.
    series: series.filter((p) => Date.parse(p.timestamp) <= now.getTime()).map((p) => ({ t: p.timestamp.slice(0, 16), visitors: p.visitors, pageviews: p.pageviews })),
    coveredDays: q.clamped ? opts.keepDays ?? 31 : null,
    countries: countries.map((c) => ({ label: c.country === 'Others' || !c.country ? null : c.country, visitors: c.visitors, visits: c.pageviews })),
  }
}
