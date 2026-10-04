import { getList, type MediaType } from '../api'
import Row from '../components/Row'
import Seo from '../components/Seo'

export default function Browse({ type }: { type: MediaType }) {
  const lists =
    type === 'movie'
      ? [['Now Playing', '/movie/now_playing'], ['Popular', '/movie/popular'], ['Top Rated', '/movie/top_rated'], ['Upcoming', '/movie/upcoming']]
      : [['Airing Today', '/tv/airing_today'], ['On The Air', '/tv/on_the_air'], ['Popular', '/tv/popular'], ['Top Rated', '/tv/top_rated']]
  return (
    <div className="page">
      <Seo
        title={type === 'movie' ? 'Movies' : 'TV Shows'}
        description={type === 'movie'
          ? 'Browse movies now playing, popular, top rated and upcoming on Cucuflix.'
          : 'Browse TV shows airing today, popular and top rated on Cucuflix.'}
        path={type === 'movie' ? '/movies' : '/tv'}
      />
      <h1 className="page-title">{type === 'movie' ? 'Movies' : 'TV Shows'}</h1>
      {lists.map(([title, path]) => (
        <Row key={path} title={title} load={() => getList(path, type)} />
      ))}
    </div>
  )
}
