import { Check, Play, Plus, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { img, type Media } from '../api'
import { toggleSaved, useSaved } from '../library'

// `to`, `sub` and `progress` (0–1, a bar along the poster; at least a sliver so a few minutes in shows) are for Continue Watching.
// `action` replaces the My List button in the poster's corner.
export default function Card({ item, rank, to, sub, progress, action }: {
  item: Media
  rank?: number
  to?: string
  sub?: string
  progress?: number
  action?: ReactNode
}) {
  const poster = img(item.poster_path)
  const year = item.date.slice(0, 4)
  return (
    <div className="card-wrap">
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
      {action ?? <SaveButton item={item} />}
    </div>
  )
}

function SaveButton({ item }: { item: Media }) {
  const saved = useSaved(item.media_type, item.id)
  return (
    <button
      className={saved ? 'card-action on' : 'card-action'}
      onClick={() => toggleSaved(item)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${item.title} from My List` : `Add ${item.title} to My List`}
    >
      {saved ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
    </button>
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
