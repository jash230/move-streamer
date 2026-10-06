import { Compass, Eye, Play, Star } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarList, TrendChart } from '../charts'
import { ago, country, num, pct, place } from '../format'
import type { Live, LivePerson, Overview as Data, Point } from '../types'
import { Card, Kpi, Loaded, Ticker } from '../ui'
import { useReport } from '../useReport'

const METRICS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'pageviews', label: 'Page views' },
  { key: 'plays', label: 'Plays' },
] as const

// Bucket times are UTC (the day boundary Vercel Analytics uses), so label them in UTC too.
function points(series: Point[], unit: 'hour' | 'day', metric: (typeof METRICS)[number]['key']) {
  return series.map((p) => {
    const d = new Date(`${p.t}:00Z`)
    const opts = { timeZone: 'UTC' } as const
    return unit === 'hour'
      ? { label: `${d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', minute: '2-digit' })} UTC`, short: d.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit' }), value: p[metric] }
      : { label: d.toLocaleDateString('en-GB', { ...opts, weekday: 'short', day: 'numeric', month: 'short' }), short: d.toLocaleDateString('en-GB', { ...opts, day: 'numeric', month: 'short' }), value: p[metric] }
  })
}

function Person({ p }: { p: LivePerson }) {
  const where = place(p.city, p.country)
  const [Icon, what] =
    p.type === 'play_start' ? [Play, p.title ?? 'Something'] :
    p.type === 'title_view' ? [Eye, p.title ?? 'A title'] :
    [Compass, p.path === '/' || !p.path ? 'Home page' : p.path]
  return (
    <li>
      <Icon size={14} aria-hidden="true" className={p.type === 'play_start' ? 'live-icon on' : 'live-icon'} />
      <span className="live-what">{what}</span>
      <span className="live-where">{where}</span>
    </li>
  )
}

function LiveCard() {
  const live = useReport<Live>('live', {}, 10_000)
  const n = live.data?.total ?? 0
  const watching = live.data?.watching ?? 0
  return (
    <section className="panel live-card" aria-live="polite">
      <header className="panel-head">
        <h2><span className={n ? 'booth-light on' : 'booth-light'} aria-hidden="true" />Live now</h2>
        <span className="panel-meta">Last 2 minutes</span>
      </header>
      {live.error && !live.data ? <p className="error">{live.error}</p> : (
        <>
          <p className="live-number">{live.data ? <Ticker value={n} /> : '–'}</p>
          <p className="live-sub">{n === 0 ? 'No one is on the site right now' : `${watching} watching, ${n - watching} browsing`}</p>
          {n > 0 && (
            <ul className="live-people">
              {live.data!.people.slice(0, 4).map((p, i) => <Person key={i} p={p} />)}
              {n > 4 && <li className="live-more">and {n - 4} more</li>}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

export default function Overview() {
  const state = useReport<Data>('overview')
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('visitors')
  const fromVercel = 'Counted by Vercel Analytics, so it matches your Vercel dashboard. Days run midnight to midnight UTC.'
  return (
    <div className="bento">
      <LiveCard />
      <Loaded state={state} lines={6}>
        {(d) => (
          <div className="bento-rest">
            {d.source !== 'vercel' && d.sourceNote && <p className="notice">{d.sourceNote}</p>}
            {d.coveredDays && <p className="notice quiet">Vercel keeps {d.coveredDays} days of history on the Hobby plan, so visitors, page views and countries cover the last {d.coveredDays} days.</p>}
            <div className="kpis">
              <Kpi label="Visitors" value={num(d.current.visitors)} now={d.current.visitors} before={d.previous?.visitors}
                spark={d.series.map((p) => p.visitors)}
                info={<>Different people. {d.source === 'vercel' ? fromVercel + ' Vercel resets visitors daily, so someone who comes back on another day counts again.' : 'Counted once each.'}</>} />
              <Kpi label="Page views" value={num(d.current.pageviews)} now={d.current.pageviews} before={d.previous?.pageviews}
                spark={d.series.map((p) => p.pageviews)}
                info={<>Every page opened, including repeats. {d.source === 'vercel' ? fromVercel : ''}</>} />
              <Kpi label="Plays" value={num(d.current.plays)} now={d.current.plays} before={d.previous?.plays}
                spark={d.series.map((p) => p.plays)}
                info="Times someone pressed play on a movie or episode." />
              <Kpi label="Bounce rate" value={pct(d.current.bounceRate)} now={d.current.bounceRate} before={d.previous?.bounceRate} upIsGood={false}
                foot={<span className="meter" aria-hidden="true"><span style={{ width: pct(d.current.bounceRate) }} /></span>}
                info="Visits that opened only the home page and left without doing anything else. Lower is better." />
            </div>

            <Card
              className="wide"
              title="Traffic"
              info={d.unit === 'hour' ? 'Per hour today, UTC.' : 'Per day, UTC.'}
              action={
                <div className="segmented" role="group" aria-label="Show">
                  {METRICS.map((m) => (
                    <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
                  ))}
                </div>
              }
            >
              <TrendChart points={points(d.series, d.unit, metric)} name={METRICS.find((m) => m.key === metric)!.label} unit={d.unit} />
            </Card>

            <div className="trio">
              <Card title="Top countries" info={d.source === 'vercel' ? fromVercel : 'By number of people.'}
                action={<Link className="panel-link" to={`/admin/audience${location.search}`}>More</Link>}>
                <BarList items={d.countries.map((r) => ({ key: r.label ?? 'other', label: r.label ? country(r.label) : 'Other countries', value: r.visitors }))} />
              </Card>
              <Card title="Top cities" info="From Cucuflix's own tracking; Vercel doesn't report cities.">
                <BarList items={d.cities.map((r) => ({ key: `${r.label}-${r.country}`, label: place(r.label, r.country), value: r.visitors }))} />
              </Card>
              <Card title="Latest reviews" action={<Link className="panel-link" to={`/admin/reviews${location.search}`}>All</Link>}>
                {d.reviews.length === 0 ? <p className="empty-note">No reviews in this period.</p> : (
                  <ul className="review-list compact">
                    {d.reviews.map((r) => <ReviewItem key={r.id} r={r} />)}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </Loaded>
    </div>
  )
}

export function ReviewItem({ r }: { r: Data['reviews'][number] }) {
  return (
    <li className="rev">
      <div className="review-head">
        <span className="stars" aria-label={`${r.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, i) => <Star key={i} size={15} fill={i < r.rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
        </span>
        <span className="review-who">{r.name || 'Anonymous'}</span>
        <span className="muted">{ago(r.at)}</span>
      </div>
      {r.comment ? <p>{r.comment}</p> : <p className="muted">Stars only, no comment.</p>}
      {r.page && <span className="review-page">Left on {r.page}</span>}
    </li>
  )
}
