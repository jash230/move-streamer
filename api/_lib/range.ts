// Date-range presets for admin reports. Days run midnight to midnight in the admin timezone
// (UTC by default, the boundary Vercel Analytics uses) so both sources cover the same days.
// Each range carries the previous period of equal length so numbers can be compared.
const DAY = 86_400_000
const DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

export interface Range {
  from: Date
  to: Date
  prev: { from: Date; to: Date } | null
  unit: 'hour' | 'day'
  // Calendar days covered, including today; null for all time.
  days: number | null
}

const ago = (d: Date, ms: number) => new Date(d.getTime() - ms)

export function resolveRange(key: string, now: Date, midnight: Date, firstSeen: Date | null): Range {
  if (key === 'today') return { from: midnight, to: now, prev: { from: ago(midnight, DAY), to: ago(now, DAY) }, unit: 'hour', days: 1 }
  if (key === 'all') return { from: firstSeen ?? now, to: now, prev: null, unit: 'day', days: null }
  const days = DAYS[key] ?? 7
  const from = ago(midnight, (days - 1) * DAY)
  return { from, to: now, prev: { from: ago(from, days * DAY), to: from }, unit: 'day', days }
}
