import { discoverByCountry } from '../api'
import Row from '../components/Row'

export default function Israel() {
  return (
    <div className="page">
      <h1 className="page-title">Israeli TV &amp; Film</h1>
      <p className="page-sub">Series and movies produced in Israel. Availability depends on the streaming server, so try switching servers if one doesn't play.</p>
      <Row title="Popular Israeli Series" load={() => discoverByCountry('tv', 'IL')} />
      <Row title="Top Rated Israeli Series" load={() => discoverByCountry('tv', 'IL', 'vote_average.desc')} />
      <Row title="Newest Israeli Series" load={() => discoverByCountry('tv', 'IL', 'first_air_date.desc')} />
      <Row title="Popular Israeli Movies" load={() => discoverByCountry('movie', 'IL')} />
    </div>
  )
}
