import { Link } from 'react-router-dom'
import { BarList, Funnel } from '../charts'
import { num, pct } from '../format'
import type { Watching as Data } from '../types'
import { Loaded, PageHead, Section } from '../ui'
import { useReport } from '../useReport'

export default function Watching() {
  const state = useReport<Data>('watching')
  return (
    <>
      <PageHead>What people open, press play on and finish, and what they search for.</PageHead>
      <Loaded state={state} lines={8}>
        {(d) => (
          <>
            <Section title="From visit to finished" wide hint="How many visits reached each step. The biggest drop is where people give up most.">
              <Funnel steps={[
                { label: 'Visited the site', value: d.funnel.visits },
                { label: 'Opened a movie or show', value: d.funnel.opened },
                { label: 'Pressed play', value: d.funnel.played },
                { label: 'Watched to the end', value: d.funnel.finished },
              ]} />
              <p className="footnote">Finishes are only counted when the player reports the end, so some servers undercount them.</p>
            </Section>

            <div className="columns">
              <Section title="Most played" hint="Plays started, with how often they were watched to the end.">
                <BarList
                  empty="Nothing played in this period."
                  items={d.titles.map((t) => ({
                    key: `${t.type}-${t.id}`,
                    label: <Link to={`/${t.type}/${t.id}`} target="_blank">{t.title ?? `#${t.id}`}</Link>,
                    value: t.plays,
                    note: `${num(t.viewers)} ${t.viewers === 1 ? 'person' : 'people'}, ${t.plays ? pct(t.finishes / t.plays) : '0%'} finished`,
                  }))}
                />
              </Section>
              <Section title="Most opened" hint="Title pages people looked at, played or not.">
                <BarList
                  empty="No titles opened in this period."
                  items={d.opened.map((t) => ({
                    key: `${t.type}-${t.id}`,
                    label: <Link to={`/${t.type}/${t.id}`} target="_blank">{t.title ?? `#${t.id}`}</Link>,
                    value: t.visitors,
                  }))}
                />
              </Section>
            </div>

            <div className="columns">
              <Section title="Top searches">
                <BarList
                  empty="No searches in this period."
                  items={d.searches.map((s) => ({ key: s.query, label: s.query, value: s.searches, note: s.results === 0 ? 'No results' : undefined }))}
                />
              </Section>
              <Section title="Searches with no results" hint="People wanted these and found nothing. Good candidates to check or add.">
                <BarList empty="Every search found something." items={d.empty.map((s) => ({ key: s.query, label: s.query, value: s.searches }))} />
              </Section>
            </div>
          </>
        )}
      </Loaded>
    </>
  )
}
