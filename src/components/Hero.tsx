import { Info, Play, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { img, type Media } from '../api'
import { useAsync } from '../useAsync'

const ROTATE_MS = 8000

export default function Hero({ load }: { load: () => Promise<Media[]> }) {
  const { data, loading } = useAsync(load, [])
  const items = (data ?? []).filter((m) => m.backdrop_path).slice(0, 5)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((n) => (n + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [items.length])

  if (loading) return <div className="hero hero-skeleton skeleton" aria-hidden="true" />
  const item = items[i]
  if (!item) return null

  return (
    <section className="hero" aria-label="Featured">
      {items.map((m, n) => (
        <img
          key={m.id}
          className={n === i ? 'hero-bg active' : 'hero-bg'}
          src={img(m.backdrop_path, 'w1280')}
          alt=""
          fetchPriority={n === 0 ? 'high' : 'low'}
        />
      ))}
      <div className="hero-shade" />
      <div className="hero-content" key={item.id}>
        <span className="eyebrow">{item.media_type === 'tv' ? 'Series' : 'Movie'} · Trending</span>
        <h2>{item.title}</h2>
        <p className="hero-meta">
          {item.vote_average > 0 && <><Star size={14} fill="currentColor" className="star" /> {item.vote_average.toFixed(1)}</>}
          {item.date && <span>{item.date.slice(0, 4)}</span>}
        </p>
        <p className="hero-overview">{item.overview}</p>
        <div className="hero-actions">
          <Link to={`/${item.media_type}/${item.id}?play=1`} className="btn btn-primary">
            <Play size={18} fill="currentColor" /> Play
          </Link>
          <Link to={`/${item.media_type}/${item.id}`} className="btn btn-secondary">
            <Info size={18} /> More info
          </Link>
        </div>
      </div>
      {items.length > 1 && (
        <div className="hero-dots" role="tablist" aria-label="Featured titles">
          {items.map((m, n) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={n === i}
              aria-label={m.title}
              className={n === i ? 'dot active' : 'dot'}
              onClick={() => setI(n)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
