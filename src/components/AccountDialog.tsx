import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { closeAccount, openAccount, sendPasswordReset, setNewPassword, signIn, signUp, useAccountDialog, type AccountMode } from '../auth'

const MIN_PASSWORD = 8

const COPY: Record<AccountMode, { title: string; lede: string; submit: string; busy: string }> = {
  'sign-in': { title: 'Sign in', lede: 'Pick up where you paused, on any device.', submit: 'Sign in', busy: 'Signing in…' },
  'sign-up': { title: 'Create account', lede: 'Your Continue Watching, My List and watched episodes, saved to your account.', submit: 'Create account', busy: 'Creating…' },
  forgot: { title: 'Reset password', lede: "We'll email you a link to choose a new one.", submit: 'Send link', busy: 'Sending…' },
  'new-password': { title: 'New password', lede: 'Choose a new password for your account.', submit: 'Save password', busy: 'Saving…' },
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string } | { kind: 'done'; title: string; message: string }

const friendly = (err: unknown) => {
  const message = (err as Error)?.message ?? String(err)
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match an account.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first. The link is in your inbox.'
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.'
  if (/failed to fetch|network/i.test(message)) return 'Couldn’t reach the server. Check your connection.'
  return message
}

export default function AccountDialog() {
  const mode = useAccountDialog()
  const ref = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (mode && !d.open) d.showModal()
    if (!mode && d.open) d.close()
  }, [mode])

  // Switching between sign in, create account and reset starts the form fresh (email is kept).
  const [shownMode, setShownMode] = useState(mode)
  if (mode !== shownMode) {
    setShownMode(mode)
    setStatus({ kind: 'idle' })
    setPassword('')
  }

  const close = () => {
    closeAccount()
    setStatus({ kind: 'idle' })
    setPassword('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!mode) return
    if ((mode === 'sign-up' || mode === 'new-password') && password.length < MIN_PASSWORD) {
      setStatus({ kind: 'error', message: `Use at least ${MIN_PASSWORD} characters for your password.` })
      return
    }
    setStatus({ kind: 'busy' })
    try {
      if (mode === 'sign-in') {
        await signIn(email.trim(), password)
        close()
      } else if (mode === 'sign-up') {
        const ready = await signUp(email.trim(), password)
        if (ready) close()
        else setStatus({ kind: 'done', title: 'Check your email', message: `We sent a confirmation link to ${email.trim()}. Open it and you're signed in.` })
      } else if (mode === 'forgot') {
        await sendPasswordReset(email.trim())
        setStatus({ kind: 'done', title: 'Check your email', message: `If ${email.trim()} has an account, a reset link is on its way.` })
      } else {
        await setNewPassword(password)
        setStatus({ kind: 'done', title: 'Password saved', message: "You're signed in with your new password." })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: friendly(err) })
    }
  }

  const copy = COPY[mode ?? 'sign-in']
  const busy = status.kind === 'busy'

  return (
    <dialog
      ref={ref}
      className="review account"
      aria-labelledby="account-title"
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className="review-panel">
        <button type="button" className="review-close" onClick={close} aria-label="Close">
          <X size={20} />
        </button>

        {status.kind === 'done' ? (
          <div className="review-done" role="status">
            <span className="review-done-mark"><Check size={28} strokeWidth={2.5} /></span>
            <h2 id="account-title">{status.title}</h2>
            <p>{status.message}</p>
            <button type="button" className="btn btn-primary" onClick={close}>Back to watching</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {(mode === 'sign-in' || mode === 'sign-up') && (
              <div className="account-tabs" role="tablist" aria-label="Account">
                <button type="button" role="tab" aria-selected={mode === 'sign-in'} onClick={() => openAccount('sign-in')}>Sign in</button>
                <button type="button" role="tab" aria-selected={mode === 'sign-up'} onClick={() => openAccount('sign-up')}>Create account</button>
              </div>
            )}
            <h2 id="account-title">{copy.title}</h2>
            <p className="review-lede">{copy.lede}</p>

            {mode !== 'new-password' && (
              <label className="field">
                <span className="field-label">Email</span>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            )}

            {mode !== 'forgot' && (
              <label className="field">
                <span className="field-label">{mode === 'new-password' ? 'New password' : 'Password'}</span>
                <input
                  type="password"
                  required
                  minLength={mode === 'sign-in' ? undefined : MIN_PASSWORD}
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode !== 'sign-in' && <span className="field-hint">At least {MIN_PASSWORD} characters.</span>}
              </label>
            )}

            {status.kind === 'error' && <p className="field-error" role="alert">{status.message}</p>}

            <div className="review-actions">
              {mode === 'sign-in' && <button type="button" className="btn btn-ghost" onClick={() => openAccount('forgot')}>Forgot password?</button>}
              {mode === 'forgot' && <button type="button" className="btn btn-ghost" onClick={() => openAccount('sign-in')}>Back to sign in</button>}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <><Loader2 size={18} className="spin" aria-hidden="true" /> {copy.busy}</> : copy.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
