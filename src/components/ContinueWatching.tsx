import { X } from 'lucide-react'
import type { Media } from '../api'
import { removeProgress, useContinueWatching, type Progress } from '../progress'
import Card from './Card'
import Row from './Row'

const toMedia = (p: Progress): Media => ({
  id: Number(p.id),
  media_type: p.type,
  title: p.title,
  overview: '',
  poster_path: p.poster_path,
  backdrop_path: p.backdrop_path,
  vote_average: 0,
  popularity: 0,
  date: p.date,
})

function subtitle(p: Progress) {
  if (p.type !== 'tv') return 'Movie'
  const at = `S${p.season} · E${p.episode}`
  return p.duration ? at : `Next: ${at}`
}

// Titles you started, newest first. Cards open straight into the player at the saved episode.
export default function ContinueWatching() {
  const progress = useContinueWatching()
  if (!progress.length) return null
  const byKey = new Map(progress.map((p) => [`${p.type}-${p.id}`, p]))

  return (
    <Row
      title="Continue Watching"
      items={progress.map(toMedia)}
      card={(m) => {
        const p = byKey.get(`${m.media_type}-${m.id}`)!
        return (
          <div className="card-wrap" key={`${p.type}-${p.id}`}>
            <Card item={m} to={`/${p.type}/${p.id}?play=1`} sub={subtitle(p)} progress={p.duration ? p.position / p.duration : 0} />
            <button className="card-remove" onClick={() => removeProgress(p.type, p.id)} aria-label={`Remove ${p.title} from Continue Watching`}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      }}
    />
  )
}
