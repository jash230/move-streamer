import { getList, type MediaType } from '../api'
import Row from '../components/Row'

export default function Browse({ type }: { type: MediaType }) {
  const lists =
    type === 'movie'
      ? [['Now Playing', '/movie/now_playing'], ['Popular', '/movie/popular'], ['Top Rated', '/movie/top_rated'], ['Upcoming', '/movie/upcoming']]
      : [['Airing Today', '/tv/airing_today'], ['On The Air', '/tv/on_the_air'], ['Popular', '/tv/popular'], ['Top Rated', '/tv/top_rated']]
  return (
    <div className="page">
      <h1 className="page-title">{type === 'movie' ? 'Movies' : 'TV Shows'}</h1>
      {lists.map(([title, path]) => (
        <Row key={path} title={title} load={() => getList(path, type)} />
      ))}
    </div>
  )
}
