import { Loader2, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { discover, getGenres, getList, surprise, type Media, type MediaType } from '../api'
import Row from '../components/Row'
import Seo from '../components/Seo'
import { useAsync } from '../useAsync'

// Also baked into dist/movies.html and dist/tv.html by scripts/landing-pages.mjs; keep them in sync.
const MOVIES_DESCRIPTION = 'Watch movies online for free on Cucuflix. Stream now playing, popular, top rated and upcoming movies, no download needed.'
const YEARS = Array.from({ length: new Date().getFullYear() - 1949 }, (_, i) => String(new Date().getFullYear() - i))
const today = () => new Date().toISOString().slice(0, 10)
const TV_DESCRIPTION = 'Watch TV shows online for free on Cucuflix. Stream full seasons and episodes of popular, top rated and airing-today series.'

export default function Browse({ type }: { type: MediaType }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { data: genres } = useAsync(() => getGenres(type), [type])
  const genreId = params.get('genre') ?? undefined
  const genre = genres?.find((g) => String(g.id) === genreId)
  const year = params.get('year') ?? undefined
  const [rolling, setRolling] = useState(false)
  const released = type === 'movie' ? 'primary_release_date' : 'first_air_date'

  const filter: Record<string, string> = {}
  if (genre) filter.with_genres = genreId!
  // A single year has far fewer votes per title than all time.
  if (year) Object.assign(filter, { [type === 'movie' ? 'primary_release_year' : 'first_air_date_year']: year, 'vote_count.gte': '100' })
  const label = [year, genre?.name].filter(Boolean).join(' ')

  const lists: [string, () => Promise<Media[]>][] = label
    ? [
        [`Popular ${label}`, () => discover(type, { 'vote_count.gte': '0', ...filter, sort_by: 'popularity.desc' })],
        [`Top Rated ${label}`, () => discover(type, { 'vote_count.gte': '500', ...filter, sort_by: 'vote_average.desc' })],
        [`New ${label}`, () => discover(type, { 'vote_count.gte': '50', ...filter, sort_by: `${released}.desc`, [`${released}.lte`]: today() })],
      ]
    : (type === 'movie'
        ? [['Now Playing', '/movie/now_playing'], ['Popular', '/movie/popular'], ['Top Rated', '/movie/top_rated'], ['Upcoming', '/movie/upcoming']]
        : [['Airing Today', '/tv/airing_today'], ['On The Air', '/tv/on_the_air'], ['Popular', '/tv/popular'], ['Top Rated', '/tv/top_rated']]
      ).map(([title, path]) => [title, () => getList(path, type)])

  const setFilter = (key: 'genre' | 'year', value?: string) => {
    const next = new URLSearchParams(params)
    if (value === undefined || value === params.get(key)) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const pickGenre = (id?: number) => setFilter('genre', id === undefined ? undefined : String(id))

  const roll = async () => {
    setRolling(true)
    try {
      const pick = await surprise(type, filter)
      if (pick) navigate(`/${pick.media_type}/${pick.id}`)
    } finally {
      setRolling(false)
    }
  }

  return (
    <div className="page">
      <Seo
        title={type === 'movie' ? 'Free Website to Watch Movies Online' : 'Free Website to Watch TV Shows Online'}
        description={type === 'movie' ? MOVIES_DESCRIPTION : TV_DESCRIPTION}
        path={type === 'movie' ? '/movies' : '/tv'}
      />
      <h1 className="page-title">{type === 'movie' ? 'Movies' : 'TV Shows'}</h1>
      <p className="page-sub">
        {type === 'movie'
          ? 'Watch movies online for free: new releases, popular hits, all-time top rated films and what is coming soon.'
          : 'Watch TV shows online for free: full seasons and episodes of series airing today, popular shows and top rated TV.'}
      </p>
      <div className="browse-tools">
        <div className="browse-row">
        <button className="btn btn-primary surprise" onClick={roll} disabled={rolling}>
          {rolling ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Shuffle size={18} aria-hidden="true" />}
          Surprise me{label ? ` with ${label}` : ''}
        </button>
        <label className="sr-only" htmlFor="year">Year</label>
        <select id="year" className="year-select" value={year ?? ''} onChange={(e) => setFilter('year', e.target.value || undefined)}>
          <option value="">Any year</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        </div>
        {genres && (
          <div className="genre-chips" role="group" aria-label="Filter by genre">
            <button className="genre-chip" aria-pressed={!genre} onClick={() => pickGenre()}>All</button>
            {genres.map((g) => (
              <button key={g.id} className="genre-chip" aria-pressed={g.id === genre?.id} onClick={() => pickGenre(g.id)}>{g.name}</button>
            ))}
          </div>
        )}
      </div>
      {lists.map(([title, load]) => (
        <Row key={`${type}-${title}`} title={title} load={load} />
      ))}
    </div>
  )
}
