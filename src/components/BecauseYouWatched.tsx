import { getSimilar } from '../api'
import { useContinueWatching } from '../progress'
import Row from './Row'

// Up to two rows seeded by the titles watched most recently, minus anything already started.
export default function BecauseYouWatched() {
  const progress = useContinueWatching()
  const started = new Set(progress.map((p) => `${p.type}-${p.id}`))
  return progress.slice(0, 2).map((p) => (
    <Row
      key={`${p.type}-${p.id}`}
      title={`Because you watched ${p.title}`}
      load={() => getSimilar(p.type, p.id).then((found) => found.filter((m) => !started.has(`${m.media_type}-${m.id}`)))}
    />
  ))
}
