import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { readReport } from './readReport'

export const RANGES = [
  { key: 'today', label: 'Today', span: 'today', previous: 'yesterday at this time' },
  { key: '7d', label: '7 days', span: 'the last 7 days', previous: 'the 7 days before' },
  { key: '30d', label: '30 days', span: 'the last 30 days', previous: 'the 30 days before' },
  { key: '90d', label: '90 days', span: 'the last 90 days', previous: 'the 90 days before' },
  { key: 'all', label: 'All time', span: 'all time', previous: '' },
] as const
export type RangeKey = (typeof RANGES)[number]['key']

export function useRange() {
  const [params] = useSearchParams()
  const key = params.get('range')
  return RANGES.find((r) => r.key === key) ?? RANGES[1]
}

export interface ReportState<T> {
  data?: T
  error?: string
  loading: boolean
  reload: () => void
}

// Fetches /api/admin with the Clerk session token. Old data stays on screen while new data loads,
// so switching ranges never blanks the page. `every` polls (used by the live count).
export function useReport<T>(report: string, extra: Record<string, string> = {}, every?: number): ReportState<T> {
  const { getToken } = useAuth()
  const range = useRange().key
  const query = new URLSearchParams({ report, range, ...extra }).toString()
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true }))
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch(`/api/admin?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        const data = await readReport<T>(res)
        if (id === seq.current) setState({ data, loading: false })
      } catch (e) {
        if (id === seq.current) setState((s) => ({ ...s, error: (e as Error).message, loading: false }))
      }
    })()
  }, [query, tick, getToken])

  useEffect(() => {
    if (!every) return
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), every)
    return () => clearInterval(t)
  }, [every])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  return { ...state, reload }
}
