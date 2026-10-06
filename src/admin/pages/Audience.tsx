import { BarList } from '../charts'
import { country, num, pct, place } from '../format'
import type { Audience as Data, Row } from '../types'
import { Kpi, Loaded, PageHead, Section } from '../ui'
import { useRange, useReport } from '../useReport'

const bars = (rows: Row[], label: (r: Row) => string = (r) => r.label ?? 'Unknown') =>
  rows.map((r) => ({ key: r.label ?? '-', label: label(r), value: r.visitors }))

export default function Audience() {
  const state = useReport<Data>('audience')
  const range = useRange()
  return (
    <>
      <PageHead>Who visits, where from, on what, and whether they come back. Every list counts people, not visits.</PageHead>
      <Loaded state={state} lines={8}>
        {(d) => {
          const total = d.split.new + d.split.returning
          const r = d.retention
          return (
            <>
              <div className="kpis two">
                <Kpi label="New visitors" value={num(d.split.new)} foot={total ? `${pct(d.split.new / total)} of everyone in ${range.span}` : undefined}
                  info="People on Cucuflix for the first time." />
                <Kpi label="Returning visitors" value={num(d.split.returning)} foot={total ? `${pct(d.split.returning / total)} of everyone in ${range.span}` : undefined}
                  info={`People who had visited before ${range.span === 'all time' ? 'their latest visit' : 'this period'}.`} />
              </div>

              <Section title="Do new visitors come back?" wide hint={`Of the ${num(r.cohort)} people whose first visit was in ${range.span}, how many came back later.`}>
                {r.cohort === 0 ? <p className="empty-note">No first-time visitors in this period.</p> : (
                  <BarList
                    format={(n) => pct(n / r.cohort)}
                    of={r.cohort}
                    items={[
                      { key: 'd1', label: 'Within a day', value: r.day1, note: `${num(r.day1)} people` },
                      { key: 'd7', label: 'Within a week', value: r.day7, note: `${num(r.day7)} people` },
                      { key: 'd30', label: 'Within a month', value: r.day30, note: `${num(r.day30)} people` },
                    ]}
                  />
                )}
                <p className="footnote">Recent visitors haven't had a full week or month yet, so short ranges undercount the longer windows.</p>
              </Section>

              <div className="columns">
                <Section title="Countries" hint={d.source === 'vercel' ? 'Counted by Vercel Analytics, matching your Vercel dashboard.' : undefined}><BarList items={bars(d.countries, (x) => (x.label ? country(x.label) : 'Other countries'))} /></Section>
                <Section title="Cities"><BarList items={d.cities.map((c) => ({ key: `${c.label}-${c.country}`, label: place(c.label, c.country), value: c.visitors }))} /></Section>
              </div>

              <div className="columns three">
                <Section title="Devices"><BarList items={bars(d.devices)} /></Section>
                <Section title="Browsers"><BarList items={bars(d.browsers)} /></Section>
                <Section title="Systems"><BarList items={bars(d.systems)} /></Section>
              </div>

              <div className="columns">
                <Section title="Where they came from" hint="The site that sent them. Direct means they typed the address, used a bookmark or an app that hides its source.">
                  <BarList items={bars(d.sources, (x) => x.label ?? 'Direct')} />
                </Section>
                <Section title="Campaign links" hint={<>Links tagged with <code>?utm_source=</code> or <code>utm_campaign</code>, for example in an Instagram bio.</>}>
                  <BarList
                    empty="No tagged links used in this period."
                    items={d.campaigns.map((c) => ({ key: `${c.source}-${c.campaign}`, label: [c.source, c.campaign].filter(Boolean).join(' / '), value: c.visitors }))}
                  />
                </Section>
              </div>
            </>
          )
        }}
      </Loaded>
    </>
  )
}
