import { Play, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { img, type Media } from '../api'

// `to`, `sub` and `progress` (0–1, a bar along the poster; at least a sliver so a few minutes in shows) are for Continue Watching.
export default function Card({ item, rank, to, sub, progress }: { item: Media; rank?: number; to?: string; sub?: string; progress?: number }) {
  const poster = img(item.poster_path)
  const year = item.date.slice(0, 4)
  return (
    <Link to={to ?? `/${item.media_type}/${item.id}`} className="card" aria-label={`${rank ? `Number ${rank}: ` : ''}${item.title}${sub ? `, ${sub}` : year ? ` (${year})` : ''}`}>
      <div className="poster">
        {poster ? <img src={poster} alt="" loading="lazy" width={342} height={513} /> : <span className="noposter">{item.title}</span>}
        <div className="poster-overlay" aria-hidden="true">
          <span className="poster-play"><Play size={22} fill="currentColor" /></span>
        </div>
        {item.vote_average > 0 && (
          <span className="rating" aria-hidden="true">
            <Star size={12} fill="currentColor" /> {item.vote_average.toFixed(1)}
          </span>
        )}
        {progress ? <span className="poster-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(5, progress * 100))}%` }} /></span> : null}
      </div>
      <div className="card-meta">
        <span className="card-title">{item.title}</span>
        <span className="card-sub">
          {sub ? <span>{sub}</span> : (
            <>
              {year && <span>{year}</span>}
              <span>{item.media_type === 'tv' ? 'Series' : 'Movie'}</span>
            </>
          )}
        </span>
      </div>
    </Link>
  )
}

export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="poster skeleton" />
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
    </div>
  )
}
