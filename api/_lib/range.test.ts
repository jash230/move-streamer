import { describe, expect, it } from 'vitest'
import { resolveRange } from './range.js'

const now = new Date('2026-10-06T18:00:00Z')
const midnight = new Date('2026-10-06T00:00:00Z') // UTC midnight, the day boundary Vercel Analytics uses
const DAY = 86_400_000

describe('resolveRange', () => {
  it('compares today so far with yesterday up to the same time', () => {
    const r = resolveRange('today', now, midnight, null)
    expect(r).toEqual({
      from: midnight,
      to: now,
      prev: { from: new Date(midnight.getTime() - DAY), to: new Date(now.getTime() - DAY) },
      unit: 'hour',
      days: 1,
    })
  })

  it('covers N calendar days including today, compared with the N days before', () => {
    const r = resolveRange('7d', now, midnight, null)
    expect(r.from).toEqual(new Date(midnight.getTime() - 6 * DAY))
    expect(r.to).toEqual(now)
    expect(r.prev).toEqual({ from: new Date(midnight.getTime() - 13 * DAY), to: new Date(midnight.getTime() - 6 * DAY) })
    expect(r.unit).toBe('day')
    expect(r.days).toBe(7)
  })

  it('starts all time at the first visit and has nothing to compare with', () => {
    const first = new Date('2026-09-01T10:00:00Z')
    expect(resolveRange('all', now, midnight, first)).toEqual({ from: first, to: now, prev: null, unit: 'day', days: null })
    expect(resolveRange('all', now, midnight, null).from).toEqual(now)
  })

  it('falls back to 7 days for unknown keys', () => {
    expect(resolveRange('bogus', now, midnight, null).from).toEqual(new Date(midnight.getTime() - 6 * DAY))
  })
})
