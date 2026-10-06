// Pure helpers for the /api/e tracker endpoint: validate a batch, summarize it for the session row,
// and read device/browser/OS from the user agent. No I/O here so it can be unit-tested.

export const EVENT_TYPES = ['page_view', 'title_view', 'play_start', 'play_finish', 'server_switch', 'search', 'heartbeat'] as const
export type EventType = (typeof EVENT_TYPES)[number]
export type Props = Record<string, string | number | boolean>

export interface IncomingEvent {
  t: EventType
  p: string
  at: number
  d?: Props
}

export interface Batch {
  v: string
  s: string
  r?: string
  u?: { source?: string; medium?: string; campaign?: string }
  e: IncomingEvent[]
}

const ID = /^[A-Za-z0-9_-]{8,64}$/
const MAX_EVENTS = 50
const MAX_SKEW = 10 * 60_000
const MAX_PROPS = 12

const str = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : undefined)

function props(raw: unknown): Props | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Props = {}
  for (const [k, v] of Object.entries(raw).slice(0, MAX_PROPS)) {
    if (typeof v === 'string') out[k.slice(0, 32)] = v.slice(0, 200)
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') out[k.slice(0, 32)] = v
  }
  return Object.keys(out).length ? out : undefined
}

export function parseBatch(raw: unknown, now: number): Batch | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Expected a JSON object' }
  const b = raw as Record<string, unknown>
  if (typeof b.v !== 'string' || !ID.test(b.v) || typeof b.s !== 'string' || !ID.test(b.s)) return { error: 'Bad ids' }
  if (!Array.isArray(b.e) || b.e.length === 0 || b.e.length > MAX_EVENTS) return { error: 'Bad event list' }

  const events: IncomingEvent[] = []
  for (const item of b.e) {
    const e = item as Record<string, unknown> | null
    if (!e || !EVENT_TYPES.includes(e.t as EventType)) return { error: 'Unknown event type' }
    if (typeof e.p !== 'string' || !e.p.startsWith('/')) return { error: 'Bad path' }
    const at = typeof e.at === 'number' && Math.abs(e.at - now) <= MAX_SKEW ? e.at : now
    const d = props(e.d)
    events.push({ t: e.t as EventType, p: e.p.slice(0, 300), at, ...(d ? { d } : {}) })
  }

  const u = b.u && typeof b.u === 'object' ? (b.u as Record<string, unknown>) : undefined
  const utm = u && { source: str(u.source, 100), medium: str(u.medium, 100), campaign: str(u.campaign, 100) }
  return { v: b.v, s: b.s, r: str(b.r, 500), u: utm, e: events }
}

// A bounce is a visit that entered on the home page and did nothing else; any other page,
// a second page view, or any action (title, play, search, server change) is engagement.
export function summarize(events: IncomingEvent[]) {
  const views = events.filter((e) => e.t === 'page_view')
  const engaged =
    views.length > 1 || views.some((e) => e.p !== '/') || events.some((e) => e.t !== 'page_view' && e.t !== 'heartbeat')
  const times = events.map((e) => e.at)
  return {
    pageviews: views.length,
    engaged,
    entryPath: views[0]?.p ?? events[0].p,
    first: Math.min(...times),
    last: Math.max(...times),
  }
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|go-http/i

export function parseUA(ua: string) {
  const bot = !ua || BOT.test(ua)
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
  const device = tablet ? 'Tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'Mobile' : 'Desktop'
  const browser =
    /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : 'Other'
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Other'
  return { bot, device, browser, os }
}

const bare = (host: string) => host.replace(/^www\./, '')

export function referrerHost(ref: string | undefined, selfHost: string): string | null {
  if (!ref) return null
  try {
    const host = bare(new URL(ref).hostname)
    return host && host !== bare(selfHost) ? host : null
  } catch {
    return null
  }
}
