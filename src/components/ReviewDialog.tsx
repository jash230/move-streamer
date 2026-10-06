import { Check, Loader2, Star, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'

const LABELS = ['', 'Bad', 'Not great', 'Okay', 'Good', 'Love it']
const MAX_COMMENT = 1000

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string }

export default function ReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [ratingError, setRatingError] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const reset = () => {
    setRating(0)
    setComment('')
    setName('')
    setStatus({ kind: 'idle' })
    setRatingError(false)
  }

  const close = () => {
    onClose()
    if (status.kind === 'sent') reset()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rating) {
      setRatingError(true)
      ref.current?.querySelector<HTMLInputElement>('input[name="rating"]')?.focus()
      return
    }
    setStatus({ kind: 'sending' })
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment, name, page: pathname }),
      })
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(error ?? `The server answered ${res.status}`)
      }
      setStatus({ kind: 'sent' })
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  const shown = hover || rating

  return (
    <dialog
      ref={ref}
      className="review"
      aria-labelledby="review-title"
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="review-panel">
        <button type="button" className="review-close" onClick={close} aria-label="Close">
          <X size={20} />
        </button>

        {status.kind === 'sent' ? (
          <div className="review-done" role="status">
            <span className="review-done-mark"><Check size={28} strokeWidth={2.5} /></span>
            <h2 id="review-title">Review sent</h2>
            <p>Thanks for telling us how Cucuflix is working for you.</p>
            <button type="button" className="btn btn-primary" onClick={close}>Back to watching</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id="review-title">Review Cucuflix</h2>
            <p className="review-lede">What's working, what's broken, what's missing. Only the site owner reads these.</p>

            <fieldset className="review-stars" aria-describedby={ratingError ? 'rating-error' : undefined}>
              <legend>Your rating</legend>
              <div className="stars" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={n <= shown ? 'star-btn on' : 'star-btn'} onMouseEnter={() => setHover(n)}>
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      checked={rating === n}
                      onChange={() => {
                        setRating(n)
                        setRatingError(false)
                      }}
                      className="sr-only"
                    />
                    <Star size={34} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
                    <span className="sr-only">{n} {n === 1 ? 'star' : 'stars'}, {LABELS[n]}</span>
                  </label>
                ))}
                <span className="star-word" aria-hidden="true">{LABELS[shown]}</span>
              </div>
              {ratingError && <p id="rating-error" className="field-error" role="alert">Pick a star rating to send your review.</p>}
            </fieldset>

            <label className="field">
              <span className="field-label">What should we know? <span className="muted">(optional)</span></span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
                rows={4}
                placeholder="The search is great, but episodes of…"
              />
              <span className="field-count">{comment.length}/{MAX_COMMENT}</span>
            </label>

            <label className="field">
              <span className="field-label">Your name <span className="muted">(optional)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoComplete="given-name" />
            </label>

            {status.kind === 'error' && <p className="field-error" role="alert">Couldn't send: {status.message}. Try again in a moment.</p>}

            <div className="review-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={status.kind === 'sending'}>
                {status.kind === 'sending' ? <><Loader2 size={18} className="spin" aria-hidden="true" /> Sending…</> : 'Send review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
