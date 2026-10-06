import { BarList } from '../charts'
import { num } from '../format'
import type { Reviews as Data } from '../types'
import { Kpi, Loaded, PageHead, Section } from '../ui'
import { useReport } from '../useReport'
import { ReviewItem } from './Overview'

export default function Reviews() {
  const state = useReport<Data>('reviews')
  return (
    <>
      <PageHead>What people wrote with the Review button in the site's menu.</PageHead>
      <Loaded state={state} lines={8}>
        {(d) => (
          <>
            <div className="kpis two">
              <Kpi label="Average rating" value={<>{d.summary.total ? d.summary.average.toFixed(1) : '–'}<small> / 5</small></>} />
              <Kpi label="Reviews" value={num(d.summary.total)} />
            </div>
            <div className="columns">
              <Section title="Stars given">
                <BarList items={[5, 4, 3, 2, 1].map((n) => ({ key: String(n), label: `${n} ${n === 1 ? 'star' : 'stars'}`, value: d.stars.find((s) => s.rating === n)?.n ?? 0 }))} />
              </Section>
              <Section title="All reviews" hint="Newest first.">
                {d.reviews.length === 0 ? <p className="empty-note">No reviews in this period.</p> : (
                  <ul className="review-list">{d.reviews.map((r) => <ReviewItem key={r.id} r={r} />)}</ul>
                )}
              </Section>
            </div>
          </>
        )}
      </Loaded>
    </>
  )
}
