// Display helpers: everything the dashboard prints goes through here so numbers read the same everywhere.
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en')
let regions: Intl.DisplayNames | null = null

export const num = (n: number) => (n >= 10_000 ? compact.format(n) : whole.format(n))
export const pct = (n: number) => `${Math.round(n * 100)}%`

export function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function country(code: string | null | undefined) {
  if (!code) return 'Unknown'
  try {
    regions ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regions.of(code) ?? code
  } catch {
    return code
  }
}

export const place = (city: string | null | undefined, code: string | null | undefined) =>
  city ? `${city}, ${country(code)}` : country(code)

export function ago(iso: string | Date) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86_400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export const dateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const time = (iso: string | Date) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Change vs the previous period, as a signed whole percentage. null when there is nothing to compare.
export function change(now: number, before: number | undefined | null) {
  if (before == null) return null
  if (before === 0) return now === 0 ? 0 : null
  return Math.round(((now - before) / before) * 100)
}

// Where a visit came from: a tagged campaign wins over the referring site.
export const source = (v: { referrer: string | null; utm_source: string | null }) => v.utm_source ?? v.referrer ?? 'Direct'

export const length = (v: { started_at: string; last_seen: string }) =>
  duration((new Date(v.last_seen).getTime() - new Date(v.started_at).getTime()) / 1000)
