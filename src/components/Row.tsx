import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import type { Media } from '../api'
import { useAsync } from '../useAsync'
import Card, { CardSkeleton } from './Card'

export default function Row({ title, load, ranked }: { title: string; load: () => Promise<Media[]>; ranked?: boolean }) {
  const { data, error, loading } = useAsync(load, [title])
  const scroller = useRef<HTMLDivElement>(null)
  const scroll = (dir: number) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  if (!loading && !error && data?.length === 0) return null

  return (
    <section className={ranked ? 'row row-ranked' : 'row'} aria-label={title}>
      <div className="row-head">
        <h2>{title}</h2>
        <div className="row-arrows">
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}><ChevronLeft size={20} /></button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}><ChevronRight size={20} /></button>
        </div>
      </div>
      {error && <p className="error" role="alert">Couldn't load this row: {error}</p>}
      <div className="row-scroll" ref={scroller}>
        {loading && Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
        {ranked
          ? data?.slice(0, 10).map((m, i) => (
              <div className="rank" key={`${m.media_type}-${m.id}`}>
                <span className="rank-num" aria-hidden="true">{i + 1}</span>
                <Card item={m} rank={i + 1} />
              </div>
            ))
          : data?.map((m) => <Card key={`${m.media_type}-${m.id}`} item={m} />)}
      </div>
    </section>
  )
}
