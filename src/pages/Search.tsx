import { SearchX } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { search } from '../api'
import Card, { CardSkeleton } from '../components/Card'
import { useAsync } from '../useAsync'

export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { data, error, loading } = useAsync(() => search(q), [q])
  return (
    <div className="page">
      <h1 className="page-title">Results for “{q}”</h1>
      {error && <p className="error" role="alert">Search failed: {error}</p>}
      {data?.length === 0 && (
        <div className="empty">
          <SearchX size={40} aria-hidden="true" />
          <p>No movies or shows match “{q}”.</p>
          <p className="muted">Check the spelling or try a shorter title.</p>
        </div>
      )}
      <div className="grid" aria-busy={loading}>
        {loading && Array.from({ length: 12 }, (_, i) => <CardSkeleton key={i} />)}
        {data?.map((m) => <Card key={`${m.media_type}-${m.id}`} item={m} />)}
      </div>
    </div>
  )
}
