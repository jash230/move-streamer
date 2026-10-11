import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../components/Card'
import Seo from '../components/Seo'
import { useMyList } from '../library'

export default function MyList() {
  const saved = useMyList()
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
        </div>
      ) : (
        <div className="grid">
          {saved.map((m) => <Card key={`${m.media_type}-${m.id}`} item={m} />)}
        </div>
      )}
    </div>
  )
}
