import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../components/Card'
import Seo from '../components/Seo'
import { openAccount, useSession } from '../auth'
import { useMyList } from '../library'
import { hasAccounts } from '../supabase'

export default function MyList() {
  const saved = useMyList()
  const session = useSession()
  const signedOut = hasAccounts && session === null
  return (
    <div className="page">
      <Seo title="My List" noindex />
      <h1 className="page-title">My List</h1>
      {saved.length === 0 ? (
        <div className="empty">
          <Plus size={40} aria-hidden="true" />
          <p>Nothing saved yet.</p>
          <p className="muted">Press + on any movie or show to keep it here for later.</p>
          <Link to="/" className="btn btn-secondary">Find something to watch</Link>
          {signedOut && (
            <p className="muted">
              Have an account? <button type="button" className="link-btn" onClick={() => openAccount('sign-in')}>Sign in</button> to see your list.
            </p>
          )}
        </div>
      ) : (
        <>
          {signedOut && (
            <p className="account-hint">
              Saved in this browser only. <button type="button" className="link-btn" onClick={() => openAccount('sign-up')}>Create an account</button> to keep your list and pause points on every device.
            </p>
          )}
          <div className="grid">
            {saved.map((m) => <Card key={`${m.media_type}-${m.id}`} item={m} />)}
          </div>
        </>
      )}
    </div>
  )
}
