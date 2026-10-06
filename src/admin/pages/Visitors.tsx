import { Link, useSearchParams } from 'react-router-dom'
import { dateTime, length, place, source } from '../format'
import type { Visit } from '../types'
import { Loaded, PageHead } from '../ui'
import { useReport } from '../useReport'

export default function Visitors() {
  const [params, setParams] = useSearchParams()
  const before = params.get('before') ?? ''
  const state = useReport<{ visits: Visit[] }>('visitors', before ? { before } : {})
  const page = (value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set('before', value)
    else next.delete('before')
    setParams(next)
    window.scrollTo(0, 0)
  }
  return (
    <>
      <PageHead>Every visit, newest first. Open one to see exactly what that person did, step by step.</PageHead>
      <Loaded state={state} lines={10}>
        {({ visits }) => visits.length === 0 ? <p className="empty-note">No visits in this period.</p> : (
          <>
            <div className="table-wrap">
              <table className="table visits">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Where</th>
                    <th scope="col">Device</th>
                    <th scope="col">Came from</th>
                    <th scope="col" className="n">Pages</th>
                    <th scope="col" className="n">Length</th>
                    <th scope="col"><span className="sr-only">Tags</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <th scope="row"><Link to={`/admin/visitors/${v.id}${location.search}`}>{dateTime(v.started_at)}</Link></th>
                      <td>{place(v.city, v.country)}</td>
                      <td>{[v.device, v.browser].filter(Boolean).join(', ')}</td>
                      <td>{source(v)}</td>
                      <td className="n">{v.pageviews}</td>
                      <td className="n">{length(v)}</td>
                      <td className="tags">
                        {v.returning && <span className="tag">Returning</span>}
                        {v.bounced && <span className="tag bad">Bounced</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              {before && <button type="button" className="adm-btn" onClick={() => page(null)}>Back to newest</button>}
              {visits.length === 50 && <button type="button" className="adm-btn" onClick={() => page(visits[visits.length - 1].started_at)}>Show older visits</button>}
            </div>
          </>
        )}
      </Loaded>
    </>
  )
}
