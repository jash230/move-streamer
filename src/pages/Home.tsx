import { discoverByCountry, getFamousTv, getList, getTrending } from '../api'
import ContinueWatching from '../components/ContinueWatching'
import Hero from '../components/Hero'
import MyListRow from '../components/MyListRow'
import Row from '../components/Row'
import Seo from '../components/Seo'

export default function Home() {
  return (
    <>
      <Seo
        path="/"
        description="Cucuflix is a free website to watch movies and TV shows online. Stream trending, popular and top rated films and series, plus Israeli TV."
      />
      <h1 className="sr-only">Cucuflix: watch movies and TV shows online for free</h1>
      <Hero load={getTrending} />
      <div className="rows">
        <ContinueWatching />
        <MyListRow />
        <Row title="Top 10 this week" load={getTrending} ranked />
        <Row title="Popular Movies" load={() => getList('/movie/popular', 'movie')} />
        <Row title="Popular TV Shows" load={() => getFamousTv('popularity.desc')} />
        <Row title="All-Time Favorite Shows" load={() => getFamousTv('vote_count.desc')} />
        <Row title="Israeli TV" load={() => discoverByCountry('tv', 'IL')} />
        <Row title="Top Rated Movies" load={() => getList('/movie/top_rated', 'movie')} />
        <Row title="Top Rated TV" load={() => getFamousTv('vote_average.desc')} />
      </div>
    </>
  )
}
