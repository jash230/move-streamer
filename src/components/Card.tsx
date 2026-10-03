import { Play, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { img, type Media } from '../api'

export default function Card({ item }: { item: Media }) {
  const poster = img(item.poster_path)
  const year = item.date.slice(0, 4)
  return (
    <Link to={`/${item.media_type}/${item.id}`} className="card" aria-label={`${item.title}${year ? ` (${year})` : ''}`}>
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
      </div>
      <div className="card-meta">
        <span className="card-title">{item.title}</span>
        <span className="card-sub">{item.media_type === 'tv' ? 'Series' : 'Movie'}{year && ` · ${year}`}</span>
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
