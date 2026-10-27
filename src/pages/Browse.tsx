import { getList, type MediaType } from '../api'
import Row from '../components/Row'
import Seo from '../components/Seo'

// Also baked into dist/movies.html and dist/tv.html by scripts/landing-pages.mjs; keep them in sync.
const MOVIES_DESCRIPTION = 'Watch movies online for free on Cucuflix. Stream now playing, popular, top rated and upcoming movies, no download needed.'
const TV_DESCRIPTION = 'Watch TV shows online for free on Cucuflix. Stream full seasons and episodes of popular, top rated and airing-today series.'

export default function Browse({ type }: { type: MediaType }) {
  const lists =
    type === 'movie'
      ? [['Now Playing', '/movie/now_playing'], ['Popular', '/movie/popular'], ['Top Rated', '/movie/top_rated'], ['Upcoming', '/movie/upcoming']]
      : [['Airing Today', '/tv/airing_today'], ['On The Air', '/tv/on_the_air'], ['Popular', '/tv/popular'], ['Top Rated', '/tv/top_rated']]
  return (
    <div className="page">
      <Seo
        title={type === 'movie' ? 'Watch Movies Online Free' : 'Watch TV Shows Online Free'}
        description={type === 'movie' ? MOVIES_DESCRIPTION : TV_DESCRIPTION}
        path={type === 'movie' ? '/movies' : '/tv'}
      />
      <h1 className="page-title">{type === 'movie' ? 'Movies' : 'TV Shows'}</h1>
      <p className="page-sub">
        {type === 'movie'
          ? 'Watch movies online for free: new releases, popular hits, all-time top rated films and what is coming soon.'
          : 'Watch TV shows online for free: full seasons and episodes of series airing today, popular shows and top rated TV.'}
      </p>
      {lists.map(([title, path]) => (
        <Row key={path} title={title} load={() => getList(path, type)} />
      ))}
    </div>
  )
}
