import { ArrowLeft, Clock, Play, ShieldCheck, Star, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getDetails, getEpisodes, img, SERVERS, type MediaType, type Season } from '../api'
import { useAsync } from '../useAsync'

const SERVER_KEY = 'streambox.server'

function loadServer() {
  try {
    const saved = localStorage.getItem(SERVER_KEY)
    if (SERVERS.some((s) => s.id === saved)) return saved!
  } catch { /* storage unavailable */ }
  return SERVERS[0].id
}

export default function Watch({ type }: { type: MediaType }) {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: item, error, loading } = useAsync(() => getDetails(type, id), [type, id])
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const [playing, setPlaying] = useState(params.get('play') === '1')
  const [serverId, setServerId] = useState(loadServer)
  const server = SERVERS.find((s) => s.id === serverId) ?? SERVERS[0]

  useEffect(() => {
    setEpisode(1)
    setSeason(item?.seasons?.[0]?.season_number ?? 1)
  }, [item])

  useEffect(() => {
    if (item) document.title = `${item.title} · StreamBox`
    return () => { document.title = 'StreamBox' }
  }, [item])

  const pickServer = (sid: string) => {
    setServerId(sid)
    try { localStorage.setItem(SERVER_KEY, sid) } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="watch">
        <div className="player skeleton" aria-busy="true" />
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
      </div>
    )
  }
  if (error || !item) {
    return (
      <div className="page empty">
        <TriangleAlert size={40} aria-hidden="true" />
        <p>{error ?? 'Title not found.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>Go back</button>
      </div>
    )
  }

  const backdrop = img(item.backdrop_path, 'w1280')
  const poster = img(item.poster_path, 'w342')

  return (
    <>
      {backdrop && <div className="watch-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}
      <div className="watch">
        <button className="back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Back</button>

        <div className="player" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
          {playing ? (
            <iframe
              key={`${server.id}-${season}-${episode}`}
              src={server.url(type, id, season, episode)}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="origin"
              title={`${item.title} player`}
            />
          ) : (
            <button className="play" onClick={() => setPlaying(true)}>
              <span className="play-circle"><Play size={34} fill="currentColor" /></span>
              <span className="play-label">
                {type === 'tv' ? `Play S${season} · E${episode}` : 'Play'}
              </span>
            </button>
          )}
        </div>

        <div className="servers" role="radiogroup" aria-label="Streaming server">
          <span className="servers-label">Server</span>
          {SERVERS.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={s.id === server.id}
              className={s.id === server.id ? 'server active' : 'server'}
              onClick={() => pickServer(s.id)}
              title={s.note}
            >
              {s.id === 'videasy' ? <ShieldCheck size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />}
              <span>{s.name}</span>
              <small>{s.note}</small>
            </button>
          ))}
        </div>

        <div className="info">
          {poster && <img className="info-poster" src={poster} alt="" width={160} height={240} />}
          <div>
            <h1>{item.title}</h1>
            <div className="meta">
              {item.vote_average > 0 && <span><Star size={14} fill="currentColor" className="star" /> {item.vote_average.toFixed(1)}</span>}
              {item.date && <span>{item.date.slice(0, 4)}</span>}
              {item.runtime ? <span><Clock size={14} /> {item.runtime} min</span> : null}
              {item.seasons && <span>{item.seasons.length} season{item.seasons.length === 1 ? '' : 's'}</span>}
            </div>
            {item.genres.length > 0 && (
              <ul className="chips" aria-label="Genres">
                {item.genres.map((g) => <li key={g.id}>{g.name}</li>)}
              </ul>
            )}
            <p className="overview">{item.overview || 'No description available.'}</p>
          </div>
        </div>

        {type === 'tv' && item.seasons && item.seasons.length > 0 && (
          <Episodes
            id={id}
            seasons={item.seasons}
            season={season}
            episode={episode}
            onSeason={(s) => { setSeason(s); setEpisode(1) }}
            onEpisode={(e) => { setEpisode(e); setPlaying(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          />
        )}
      </div>
    </>
  )
}

function Episodes(props: {
  id: string
  seasons: Season[]
  season: number
  episode: number
  onSeason: (s: number) => void
  onEpisode: (e: number) => void
}) {
  const { data: episodes, loading } = useAsync(() => getEpisodes(props.id, props.season), [props.id, props.season])
  return (
    <section className="episodes" aria-label="Episodes">
      <div className="episodes-head">
        <h2>Episodes</h2>
        <label className="sr-only" htmlFor="season">Season</label>
        <select id="season" value={props.season} onChange={(e) => props.onSeason(Number(e.target.value))}>
          {props.seasons.map((s) => (
            <option key={s.season_number} value={s.season_number}>{s.name} ({s.episode_count})</option>
          ))}
        </select>
      </div>
      <ul className="ep-list" aria-busy={loading}>
        {loading && Array.from({ length: 4 }, (_, i) => <li key={i} className="ep skeleton ep-skel" />)}
        {episodes?.map((ep) => {
          const active = ep.episode_number === props.episode
          return (
            <li key={ep.episode_number}>
              <button className={active ? 'ep active' : 'ep'} onClick={() => props.onEpisode(ep.episode_number)} aria-current={active}>
                <span className="ep-thumb">
                  {ep.still_path ? <img src={img(ep.still_path, 'w300')} alt="" loading="lazy" width={300} height={169} /> : null}
                  <span className="ep-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
                </span>
                <span className="ep-text">
                  <strong>{ep.episode_number}. {ep.name}</strong>
                  <span className="ep-overview">{ep.overview || 'No description.'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
