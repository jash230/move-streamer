import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { SERVERS } from '../../api'
import { serverLabel } from '../../components/ServerPicker'
import { dateTime, length, place, source, time } from '../format'
import type { Journey as Data } from '../types'
import { Loaded, PageHead } from '../ui'
import { useReport } from '../useReport'

const PAGES: Record<string, string> = { '/': 'the home page', '/movies': 'Movies', '/tv': 'TV shows', '/israel': 'Israeli titles', '/search': 'search results' }

const server = (id: unknown) => {
  const s = SERVERS.find((x) => x.id === id)
  return s ? serverLabel(s) : String(id ?? 'a server')
}

function describe(step: Data['steps'][number]) {
  const p = step.props
  const title = p.title ? String(p.title) : 'a title'
  const ep = p.s ? ` S${p.s} E${p.e}` : ''
  switch (step.type) {
    case 'page_view':
      return /^\/(movie|tv)\//.test(step.path) ? null : `Opened ${PAGES[step.path] ?? step.path}`
    case 'title_view': return `Opened ${title}`
    case 'play_start': return `Pressed play on ${title}${ep} (${server(p.server)})`
    case 'play_finish': return `Watched ${title}${ep} to the end`
    case 'server_switch': return `Switched from ${server(p.from)} to ${server(p.to)}${p.reason === 'try_next' ? ' with Try next server' : ''}`
    case 'search': return `Searched for "${p.q}"${p.picked ? ' and picked a suggestion' : `, ${p.results} results`}`
    default: return step.type
  }
}

export default function Journey() {
  const { session = '' } = useParams()
  const state = useReport<Data>('journey', { session })
  return (
    <>
      <Link className="back-link" to={`/admin/visitors${location.search}`}><ArrowLeft size={16} aria-hidden="true" /> All visitors</Link>
      <Loaded state={state} lines={8}>
        {({ visit: v, steps }) => (
          <>
            <PageHead title={`Visit from ${place(v.city, v.country)}`}>
              {dateTime(v.started_at)}, lasted {length(v)}. {v.visits_by_visitor > 1 ? `This person has visited ${v.visits_by_visitor} times.` : 'Their first and only visit so far.'}
            </PageHead>
            <dl className="facts">
              <div><dt>Device</dt><dd>{[v.device, v.os, v.browser].filter(Boolean).join(', ')}</dd></div>
              <div><dt>Came from</dt><dd>{source(v)}{v.utm_campaign ? `, campaign ${v.utm_campaign}` : ''}</dd></div>
              <div><dt>Pages</dt><dd>{v.pageviews}</dd></div>
              <div><dt>Bounced</dt><dd>{v.bounced ? 'Yes, left from the home page without doing anything' : 'No'}</dd></div>
            </dl>
            <ol className="timeline">
              {steps.map((s, i) => {
                const text = describe(s)
                return text && (
                  <li key={i} className={`step ${s.type}`}>
                    <time>{time(s.at)}</time>
                    <span>{text}</span>
                  </li>
                )
              })}
              <li className="step end">
                <time>{time(v.last_seen)}</time>
                <span>Last seen</span>
              </li>
            </ol>
            {steps.length === 0 && <p className="footnote">Step details are kept for 90 days; older visits only keep their summary.</p>}
          </>
        )}
      </Loaded>
    </>
  )
}
