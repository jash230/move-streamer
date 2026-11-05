import { LogOut, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { openAccount, signOut, useSession } from '../auth'
import { hasAccounts } from '../supabase'
import AccountDialog from './AccountDialog'

// Navbar entry for viewer accounts: "Sign in" when signed out, an initial with a small menu when in.
export default function AccountButton() {
  const session = useSession()
  const [menu, setMenu] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!hasAccounts) return null
  const email = session?.user.email ?? ''

  return (
    <div className="account-nav" ref={rootRef}>
      {session === undefined ? (
        <span className="account-btn account-loading" aria-hidden="true" />
      ) : session ? (
        <button type="button" className="account-btn account-avatar" aria-haspopup="menu" aria-expanded={menu} aria-label={`Account: ${email}`} onClick={() => setMenu((m) => !m)}>
          {(email[0] ?? '?').toUpperCase()}
        </button>
      ) : (
        <button type="button" className="nav-review account-signin" onClick={() => openAccount('sign-in')}>
          <UserRound size={18} aria-hidden="true" />
          <span>Sign in</span>
        </button>
      )}

      {menu && session && (
        <div className="account-menu" role="menu">
          <p className="account-menu-email">{email}</p>
          <p className="account-menu-note">Continue Watching and My List are saved to this account.</p>
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true)
              try { await signOut() } finally {
                setLeaving(false)
                setMenu(false)
              }
            }}
          >
            <LogOut size={16} aria-hidden="true" /> {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
      <AccountDialog />
    </div>
  )
}
