import { ArrowLeft, Clock, Play, Star, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { track } from '../analytics'
import { getDetails, getEpisodes, img, isEndedMessage, sameSite, SERVERS, type MediaType, type Season } from '../api'
import ServerPicker, { TryNextServer } from '../components/ServerPicker'
import { SourcePicker, TorrentNotice, TorrentVideo, useTorrentStreams } from '../components/Torrent'
import Seo from '../components/Seo'
import UpNext from '../components/UpNext'
import { useAsync } from '../useAsync'

// v2: the old default (Videasy) stopped working, so saved choices from before are reset.
const SERVER_KEY = 'streambox.server.v2'
const AUTONEXT_KEY = 'streambox.autonext'

function loadAutoNext() {
  try { return localStorage.getItem(AUTONEXT_KEY) !== '0' } catch { return true }
}

// The episode after the current one, rolling into the next season when this one is done.
function nextEpisode(seasons: Season[] | undefined, season: number, episode: number) {
  if (!seasons) return undefined
  const i = seasons.findIndex((s) => s.season_number === season)
  if (i === -1) return undefined
  if (episode < seasons[i].episode_count) return { season, episode: episode + 1 }
  const following = seasons[i + 1]
  return following ? { season: following.season_number, episode: 1 } : undefined
}

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
  const torrent = useTorrentStreams(item?.imdb_id, type, season, episode, Boolean(server.torrent && item))
  const [autoNext, setAutoNext] = useState(loadAutoNext)
  const [ended, setEnded] = useState(false)
  const next = type === 'tv' ? nextEpisode(item?.seasons, season, episode) : undefined

  useEffect(() => setEnded(false), [season, episode, serverId])

  const title = item?.title
  const playProps = { id, mt: type, title, s: type === 'tv' ? season : undefined, e: type === 'tv' ? episode : undefined, server: serverId }
  useEffect(() => {
    if (title) track('title_view', { id, mt: type, title })
  }, [id, type, title])
  useEffect(() => {
    if (playing && title) track('play_start', playProps)
  }, [playing, title, serverId, season, episode]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ended && title) track('play_finish', playProps)
  }, [ended]) // eslint-disable-line react-hooks/exhaustive-deps

  // Embedded players only tell us they finished through postMessage (movies too, for play_finish).
  useEffect(() => {
    if (!playing || server.torrent) return
    const src = server.url(type, id, season, episode)
    const onMessage = (e: MessageEvent) => {
      if (sameSite(e.origin, src) && isEndedMessage(e.data)) setEnded(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [playing, server, type, id, season, episode])

  const playNext = useCallback(() => {
    if (!next) return
    setSeason(next.season)
    setEpisode(next.episode)
    setPlaying(true)
  }, [next?.season, next?.episode]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAutoNext = () => {
    setAutoNext((on) => {
      try { localStorage.setItem(AUTONEXT_KEY, on ? '0' : '1') } catch { /* ignore */ }
      return !on
    })
  }

  useEffect(() => {
    setEpisode(1)
    setSeason(item?.seasons?.[0]?.season_number ?? 1)
  }, [item])

  const pickServer = (sid: string, reason: 'picker' | 'try_next' = 'picker') => {
    if (sid !== serverId) track('server_switch', { from: serverId, to: sid, reason, playing, id, mt: type })
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
      <Seo title={item.title} description={item.overview ? item.overview.slice(0, 155) : undefined} path={`/${type}/${id}`} />
      {backdrop && <div className="watch-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}
      <div className="watch">
        <button className="back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Back</button>

        <div className="player" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
          {playing && server.torrent ? (
            <TorrentVideo torrent={torrent} title={item.title} onEnded={() => setEnded(true)} />
          ) : playing ? (
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
          {ended && next && (
            <UpNext
              key={`${season}-${episode}`}
              label={next.season === season ? `Episode ${next.episode}` : `Season ${next.season}, episode 1`}
              autoplay={autoNext}
              onPlay={playNext}
              onCancel={() => setEnded(false)}
            />
          )}
        </div>

        <div className="pickers">
          <ServerPicker value={server} onChange={pickServer} />
          {server.torrent && <SourcePicker torrent={torrent} onPick={() => setPlaying(true)} />}
          <TryNextServer value={server} onChange={(sid) => pickServer(sid, 'try_next')} />
        </div>
        {server.torrent && <TorrentNotice torrent={torrent} isTv={type === 'tv'} />}

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
            autoNext={autoNext}
            onToggleAutoNext={toggleAutoNext}
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
  autoNext: boolean
  onToggleAutoNext: () => void
  onSeason: (s: number) => void
  onEpisode: (e: number) => void
}) {
  const { data: episodes, loading } = useAsync(() => getEpisodes(props.id, props.season), [props.id, props.season])
  return (
    <section className="episodes" aria-label="Episodes">
      <div className="episodes-head">
        <h2>Episodes</h2>
        <div className="episodes-controls">
          <button className="switch" role="switch" aria-checked={props.autoNext} onClick={props.onToggleAutoNext}>
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            Autoplay next episode
          </button>
          <label className="sr-only" htmlFor="season">Season</label>
          <select id="season" value={props.season} onChange={(e) => props.onSeason(Number(e.target.value))}>
            {props.seasons.map((s) => (
              <option key={s.season_number} value={s.season_number}>{s.name} ({s.episode_count})</option>
            ))}
          </select>
        </div>
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
