// First-party analytics for the /admin dashboard. Events are queued and sent in small batches to
// /api/e; nothing personal is collected — just a random visitor ID kept in this browser.
type EventType = 'page_view' | 'title_view' | 'play_start' | 'play_finish' | 'server_switch' | 'search' | 'heartbeat'
type Props = Record<string, string | number | boolean | undefined>

const VISITOR_KEY = 'cf.vid'
const SESSION_KEY = 'cf.session'
const SESSION_GAP = 30 * 60_000
const HEARTBEAT = 30_000
const FLUSH_DELAY = 2_000
const ENDPOINT = '/api/e'

// The dev server has no /api, and the admin's own browsing shouldn't count as traffic.
const enabled = () =>
  typeof window !== 'undefined' && (!import.meta.env.DEV || import.meta.env.VITE_TRACK_DEV === '1') && !location.pathname.startsWith('/admin')

const randomId = () => crypto.randomUUID().replace(/-/g, '')

let memory: { v?: string; s?: { id: string; last: number } } = {}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return memory[key === VISITOR_KEY ? 'v' : 's'] as T | undefined
  }
}

function write(key: string, value: unknown) {
  memory = { ...memory, [key === VISITOR_KEY ? 'v' : 's']: value }
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: memory only */ }
}

// The session is shared across tabs and ends after 30 idle minutes.
function ids(now: number) {
  let v = read<string>(VISITOR_KEY)
  if (!v) write(VISITOR_KEY, (v = randomId()))
  const prev = read<{ id: string; last: number }>(SESSION_KEY)
  const fresh = !prev || now - prev.last > SESSION_GAP
  const s = fresh ? randomId() : prev.id
  write(SESSION_KEY, { id: s, last: now })
  return { v, s, fresh }
}

function landing() {
  const q = new URLSearchParams(location.search)
  const u = { source: q.get('utm_source') ?? undefined, medium: q.get('utm_medium') ?? undefined, campaign: q.get('utm_campaign') ?? undefined }
  return { r: document.referrer || undefined, u: u.source || u.medium || u.campaign ? u : undefined }
}

interface Queued { t: EventType; p: string; at: number; d?: Props }
let queue: Queued[] = []
let meta: { v: string; s: string; r?: string; u?: object } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function flush(beacon = false) {
  clearTimeout(timer)
  timer = undefined
  if (!queue.length || !meta) return
  const body = JSON.stringify({ ...meta, e: queue.slice(0, 50) })
  queue = queue.slice(50)
  meta = { v: meta.v, s: meta.s }
  // text/plain keeps sendBeacon a simple request; the server parses the body itself.
  const blob = new Blob([body], { type: 'text/plain' })
  if (!(beacon && navigator.sendBeacon?.(ENDPOINT, blob))) {
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {})
  }
  if (queue.length) flush(beacon)
}

export function track(type: EventType, d?: Props) {
  if (!enabled()) return
  const now = Date.now()
  const { v, s, fresh } = ids(now)
  // A heartbeat that opens a new visit (tab back after 30+ idle minutes) counts as landing on this page.
  const t = fresh && type === 'heartbeat' ? 'page_view' : type
  if (meta && meta.s !== s) flush()
  if (!meta || meta.s !== s) meta = { v, s, ...(fresh ? landing() : {}) }
  const props = d && Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined)) as Props
  queue.push({ t, p: location.pathname, at: now, ...(props && Object.keys(props).length ? { d: props } : {}) })
  if (t === 'heartbeat') flush()
  else timer ??= setTimeout(flush, FLUSH_DELAY)
}

let started = false

// Call once at startup: heartbeats while the tab is visible, and a final flush when it hides.
export function startTracking() {
  if (started || typeof window === 'undefined') return
  started = true
  setInterval(() => {
    if (document.visibilityState === 'visible') track('heartbeat')
  }, HEARTBEAT)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}
