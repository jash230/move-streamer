import { Lock, Star } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Seo from '../components/Seo'

interface Review {
  rating: number
  comment: string
  name: string
  page: string
  at: string
}

const KEY = 'reviews-admin-key'

function readKey() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export default function AdminReviews() {
  const [key, setKey] = useState(readKey)
  const [draft, setDraft] = useState('')
  const [data, setData] = useState<{ reviews: Review[]; total: number }>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (k: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', { headers: { 'x-admin-key': k } })
      const body = await res.json()
      if (res.status === 401) {
        setKey('')
        try { localStorage.removeItem(KEY) } catch { /* ignore */ }
        throw new Error('That key is wrong. Use the REVIEWS_ADMIN_KEY value from Vercel.')
      }
      if (!res.ok) throw new Error(body.error ?? `Server answered ${res.status}`)
      setData(body)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (key) load(key)
  }, [key, load])

  const unlock = (e: FormEvent) => {
    e.preventDefault()
    const k = draft.trim()
    if (!k) return
    try { localStorage.setItem(KEY, k) } catch { /* ignore */ }
    setKey(k)
  }

  const reviews = data?.reviews ?? []
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }))

  return (
    <div className="page admin">
      <Seo title="Reviews" noindex />
      <h1 className="page-title">Site reviews</h1>

      {!key ? (
        <form className="admin-lock" onSubmit={unlock}>
          <Lock size={20} aria-hidden="true" />
          <label className="field">
            <span className="field-label">Admin key</span>
            <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" type="submit">Show reviews</button>
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
      ) : (
        <>
          {error && <p className="field-error" role="alert">{error}</p>}
          {loading && !data && <p className="muted">Loading reviews…</p>}
          {data && (
            <>
              <section className="admin-summary" aria-label="Summary">
                <div className="admin-avg">
                  <span className="admin-avg-num">{reviews.length ? avg.toFixed(1) : '–'}</span>
                  <span className="muted">{data.total} {data.total === 1 ? 'review' : 'reviews'}</span>
                </div>
                <ul className="admin-bars">
                  {counts.map(({ n, c }) => (
                    <li key={n}>
                      <span>{n}<Star size={12} fill="currentColor" aria-hidden="true" /></span>
                      <span className="admin-bar"><span style={{ width: `${reviews.length ? (c / reviews.length) * 100 : 0}%` }} /></span>
                      <span className="admin-count">{c}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {reviews.length === 0 ? (
                <p className="muted">No reviews yet. They'll show up here as soon as someone sends one from the Review button.</p>
              ) : (
                <ul className="admin-list">
                  {reviews.map((r, i) => (
                    <li key={`${r.at}-${i}`} className="admin-item">
                      <div className="admin-item-head">
                        <span className="admin-stars" aria-label={`${r.rating} of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={15} fill={n <= r.rating ? 'currentColor' : 'none'} aria-hidden="true" />
                          ))}
                        </span>
                        <strong>{r.name || 'Anonymous'}</strong>
                        <time className="muted" dateTime={r.at}>{new Date(r.at).toLocaleString()}</time>
                      </div>
                      {r.comment ? <p>{r.comment}</p> : <p className="muted">No comment</p>}
                      {r.page && <span className="admin-page muted">Sent from {r.page}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
