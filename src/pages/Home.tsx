import { discoverByCountry, getList, getTrending } from '../api'
import Hero from '../components/Hero'
import Row from '../components/Row'

export default function Home() {
  return (
    <>
      <Hero load={getTrending} />
      <div className="rows">
        <Row title="Trending This Week" load={getTrending} />
        <Row title="Popular Movies" load={() => getList('/movie/popular', 'movie')} />
        <Row title="Popular TV Shows" load={() => getList('/tv/popular', 'tv')} />
        <Row title="Israeli TV" load={() => discoverByCountry('tv', 'IL')} />
        <Row title="Top Rated Movies" load={() => getList('/movie/top_rated', 'movie')} />
        <Row title="Top Rated TV" load={() => getList('/tv/top_rated', 'tv')} />
      </div>
    </>
  )
}
