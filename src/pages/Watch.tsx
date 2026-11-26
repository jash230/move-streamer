import { ArrowLeft, Check, Clock, Eye, Film, Play, Plus, Star, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { track } from '../analytics'
import { getDetails, getEpisodes, getSimilar, img, type CastMember, type MediaType, type Playback, type Season } from '../api'
import { toggleSaved, useSaved, useWatched, watchedKey } from '../library'
import { formatTime, getProgress, isFinished, markWatched, MIN_WATCHED, recordPlayback } from '../progress'
import NativePlayer from '../components/NativePlayer'
import Row from '../components/Row'
import Seo from '../components/Seo'
import UpNext from '../components/UpNext'
import { useAsync } from '../useAsync'

// Seconds before the end of an episode that the Up next countdown starts.
const UP_NEXT_AT = 10
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

export default function Watch({ type }: { type: MediaType }) {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: item, error, loading } = useAsync(() => getDetails(type, id), [type, id])
  // Starts at the saved episode so the player doesn't load episode 1 first.
  const [season, setSeason] = useState(() => (type === 'tv' && getProgress(type, id)?.season) || 1)
  const [episode, setEpisode] = useState(() => (type === 'tv' && getProgress(type, id)?.episode) || 1)
  const [playing, setPlaying] = useState(params.get('play') === '1')
  const [autoNext, setAutoNext] = useState(loadAutoNext)
  const [trailerOpen, setTrailerOpen] = useState(false)
  // Up next shows this many seconds before the end, so the next episode starts as this one finishes.
  const [ended, setEnded] = useState(false)
  const [upNextIn, setUpNextIn] = useState(UP_NEXT_AT)
  // The player reports progress here; the save effect reads it without re-subscribing.
  const onPlaybackRef = useRef<(p: Playback) => void>(() => {})
  const next = type === 'tv' ? nextEpisode(item?.seasons, season, episode) : undefined
  // Read by the player listener when it saves progress, without re-subscribing it.
  const saveFor = useRef({ item, next })
  useEffect(() => { saveFor.current = { item, next } })
  const inList = useSaved(type, id)
  const watched = useWatched()

  // Where the player opens the episode or movie. Only read when the player (re)loads, so saving
  // progress while it plays doesn't reload it.
  const resumeAt = useMemo(() => {
    const saved = getProgress(type, id)
    if (!saved || saved.position < MIN_WATCHED) return undefined
    if (type === 'tv' && (saved.season !== season || saved.episode !== episode)) return undefined
    return saved.position
  }, [type, id, season, episode, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  // The page stays mounted when a suggestion opens another title, so that resets it too.
  useEffect(() => setEnded(false), [id, season, episode])

  const title = item?.title
  const playProps = { id, mt: type, title, s: type === 'tv' ? season : undefined, e: type === 'tv' ? episode : undefined, server: 'vidrock' }
  useEffect(() => {
    if (title) track('title_view', { id, mt: type, title })
  }, [id, type, title])
  useEffect(() => {
    if (playing && title) track('play_start', playProps)
  }, [playing, title, season, episode]) // eslint-disable-line react-hooks/exhaustive-deps

  // The native player reports how far along it is; progress is saved every 10s, when the page is
  // hidden or left, and as the episode finishes. Up next arms once the episode has been seen playing.
  useEffect(() => {
    if (!playing) return
    const want = { id, season: type === 'tv' ? season : undefined, episode: type === 'tv' ? episode : undefined }
    let seenPlaying = false
    let shown = false
    let last: Playback | undefined
    let savedAt = 0
    let finished = false
    let reported = false
    const save = (p: Playback) => {
      const { item, next } = saveFor.current
      if (!item || finished) return
      finished = isFinished(p)
      const title = { id, type, title: item.title, poster_path: item.poster_path, backdrop_path: item.backdrop_path, date: item.date }
      recordPlayback(title, want, p, next)
    }
    onPlaybackRef.current = (p: Playback) => {
      const left = p.ended ? 0 : p.duration > 0 ? Math.max(0, p.duration - p.watched) : Infinity
      if (left > UP_NEXT_AT) seenPlaying = true
      else if (seenPlaying && !shown) {
        shown = true
        setUpNextIn(Math.max(3, Math.round(left)))
        setEnded(true)
      }
      if (!seenPlaying) return
      // Reported at 90%, the same point Continue Watching counts as finished: most people close during the credits.
      const { item } = saveFor.current
      if (!reported && item && isFinished(p)) {
        reported = true
        track('play_finish', { id, mt: type, title: item.title, s: want.season, e: want.episode, server: 'vidrock' })
      }
      last = p
      if (isFinished(p) || Date.now() - savedAt >= 10_000) {
        savedAt = Date.now()
        save(p)
      }
    }
    const flush = () => { if (last) save(last) }
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      flush()
    }
  }, [playing, type, id, season, episode])

  const playNext = useCallback(() => {
    if (!next) return
    setSeason(next.season)
    setEpisode(next.episode)
    setPlaying(true)
  }, [next?.season, next?.episode]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickEpisode = (s: number, e: number) => {
    setSeason(s)
    setEpisode(e)
  }

  const toggleAutoNext = () => {
    setAutoNext((on) => {
      try { localStorage.setItem(AUTONEXT_KEY, on ? '0' : '1') } catch { /* ignore */ }
      return !on
    })
  }

  // Shows open at the episode you stopped at, if it still exists.
  useEffect(() => {
    const saved = type === 'tv' ? getProgress(type, id) : undefined
    const at = item?.seasons?.find((s) => s.season_number === saved?.season)
    if (saved?.episode && at && saved.episode <= at.episode_count) pickEpisode(at.season_number, saved.episode)
    else pickEpisode(item?.seasons?.[0]?.season_number ?? 1, 1)
  }, [item]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const progressTitle = { id, type, title: item.title, poster_path: item.poster_path, backdrop_path: item.backdrop_path, date: item.date }
  const movieWatched = watchedKey(type, id) in watched
  const toggleEpisodeWatched = (s: number, e: number) =>
    markWatched(progressTitle, { season: s, episode: e }, !(watchedKey(type, id, s, e) in watched), nextEpisode(item.seasons, s, e))

  const backdrop = img(item.backdrop_path, 'w1280')
  const poster = img(item.poster_path, 'w342')

  return (
    <>
      <Seo title={item.title} description={item.overview ? item.overview.slice(0, 155) : undefined} path={`/${type}/${id}`} />
      {backdrop && <div className="watch-backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}
      <div className="watch">
        <button className="back" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Back</button>

        <div className="player" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
          {playing ? (
            <NativePlayer
              type={type}
              id={id}
              season={season}
              episode={episode}
              resumeAt={resumeAt}
              onPlayback={(p) => onPlaybackRef.current(p)}
            />
          ) : (
            <button className="play" onClick={() => setPlaying(true)}>
              <span className="play-circle"><Play size={34} fill="currentColor" /></span>
              <span className="play-label">
                {type === 'tv'
                  ? `${resumeAt ? 'Resume' : 'Play'} S${season} · E${episode}`
                  : resumeAt ? `Resume from ${formatTime(resumeAt)}` : 'Play'}
              </span>
            </button>
          )}
          {ended && next && (
            <UpNext
              key={`${season}-${episode}`}
              label={next.season === season ? `Episode ${next.episode}` : `Season ${next.season}, episode 1`}
              autoplay={autoNext}
              seconds={upNextIn}
              onPlay={playNext}
              onCancel={() => setEnded(false)}
            />
          )}
          {ended && type === 'movie' && <MovieUpNext id={id} onCancel={() => setEnded(false)} />}
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
            <div className="title-actions">
              {item.trailer && (
                <button className="btn btn-secondary" onClick={() => setTrailerOpen(true)}>
                  <Film size={18} aria-hidden="true" /> Trailer
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => toggleSaved(item)} aria-pressed={inList}>
                {inList ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />} My List
              </button>
              {type === 'movie' && (
                <button className="btn btn-secondary" onClick={() => markWatched(progressTitle, {}, !movieWatched)} aria-pressed={movieWatched}>
                  {movieWatched ? <Check size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />} {movieWatched ? 'Watched' : 'Mark as watched'}
                </button>
              )}
            </div>
          </div>
        </div>

        {type === 'tv' && item.seasons && item.seasons.length > 0 && (
          <Episodes
            id={id}
            seasons={item.seasons}
            season={season}
            episode={episode}
            autoNext={autoNext}
            isWatched={(e) => watchedKey(type, id, season, e) in watched}
            onToggleWatched={(e) => toggleEpisodeWatched(season, e)}
            onToggleAutoNext={toggleAutoNext}
            onSeason={(s) => pickEpisode(s, 1)}
            onEpisode={(e) => { pickEpisode(season, e); setPlaying(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          />
        )}

        {item.cast.length > 0 && <Cast cast={item.cast} />}

        <div className="more-like">
          <Row key={`${type}-${id}`} title="More like this" load={() => getSimilar(type, id)} />
        </div>
      </div>
      {trailerOpen && item.trailer && <Trailer videoKey={item.trailer} title={item.title} onClose={() => setTrailerOpen(false)} />}
    </>
  )
}

// After a movie, the first similar title you haven't started or watched. No autoplay: picking a film is a bigger choice than the next episode.
function MovieUpNext({ id, onCancel }: { id: string; onCancel: () => void }) {
  const navigate = useNavigate()
  const watched = useWatched()
  const { data } = useAsync(() => getSimilar('movie', id), [id])
  const pick = data?.find((m) => !(watchedKey('movie', m.id) in watched) && !getProgress('movie', String(m.id)))
  if (!pick) return null
  return (
    <UpNext
      label={pick.date ? `${pick.title} (${pick.date.slice(0, 4)})` : pick.title}
      autoplay={false}
      seconds={0}
      playLabel="Watch now"
      onPlay={() => navigate(`/movie/${pick.id}?play=1`)}
      onCancel={onCancel}
    />
  )
}

function Trailer({ videoKey, title, onClose }: { videoKey: string; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} className="trailer" aria-label={`${title} trailer`} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <button className="trailer-close" onClick={onClose} aria-label="Close trailer"><X size={22} aria-hidden="true" /></button>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
        title={`${title} trailer`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </dialog>
  )
}

function Cast({ cast }: { cast: CastMember[] }) {
  return (
    <section className="cast" aria-labelledby="cast-title">
      <h2 id="cast-title">Cast</h2>
      <ul className="cast-list">
        {cast.map((c, i) => {
          const photo = img(c.profile_path, 'w185')
          return (
            <li key={`${c.id}-${i}`}>
              {photo
                ? <img src={photo} alt="" loading="lazy" width={88} height={88} />
                : <span className="cast-initials" aria-hidden="true">{c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
              <strong>{c.name}</strong>
              {c.character && <span>{c.character}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Episodes(props: {
  id: string
  seasons: Season[]
  season: number
  episode: number
  autoNext: boolean
  isWatched: (e: number) => boolean
  onToggleWatched: (e: number) => void
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
          const seen = props.isWatched(ep.episode_number)
          return (
            <li key={ep.episode_number} className={seen ? 'ep-item ep-seen-done' : 'ep-item'}>
              <button className={active ? 'ep active' : 'ep'} onClick={() => props.onEpisode(ep.episode_number)} aria-current={active}>
                <span className="ep-thumb">
                  {ep.still_path ? <img src={img(ep.still_path, 'w300')} alt="" loading="lazy" width={300} height={169} /> : null}
                  <span className="ep-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
                  {seen && <span className="ep-seen"><Check size={12} aria-hidden="true" /> Watched</span>}
                </span>
                <span className="ep-text">
                  <strong>{ep.episode_number}. {ep.name}</strong>
                  <span className="ep-overview">{ep.overview || 'No description.'}</span>
                </span>
              </button>
              <button
                className="ep-watch"
                onClick={() => props.onToggleWatched(ep.episode_number)}
                aria-pressed={seen}
                aria-label={seen ? `Mark episode ${ep.episode_number} as not watched` : `Mark episode ${ep.episode_number} as watched`}
                title={seen ? 'Watched' : 'Mark as watched'}
              >
                {seen ? <Check size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
