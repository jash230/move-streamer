import { discoverByCountry, getList, getTrending } from '../api'
import Hero from '../components/Hero'
import Row from '../components/Row'
import Seo from '../components/Seo'

export default function Home() {
  return (
    <>
      <Seo
        path="/"
        description="Cucuflix is a free site to browse and watch movies and TV shows, including Israeli TV, with trending, popular and top rated picks."
      />
      <h1 className="sr-only">Cucuflix: watch movies and TV shows online</h1>
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
