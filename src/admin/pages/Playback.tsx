import { SERVERS } from '../../api'
import { serverLabel } from '../../components/ServerPicker'
import { num, pct } from '../format'
import type { Playback as Data } from '../types'
import { Loaded, PageHead, Section } from '../ui'
import { useReport } from '../useReport'

function name(id: string) {
  const s = SERVERS.find((x) => x.id === id)
  return s ? `${serverLabel(s)} (${s.name})` : id
}

export default function Playback() {
  const state = useReport<Data>('playback')
  return (
    <>
      <PageHead>Which servers people use and which ones make them switch away. A high switch rate usually means the server isn't playing.</PageHead>
      <Loaded state={state} lines={6}>
        {(d) => (
          <Section title="Servers" wide hint="Switched away counts every time someone left this server for another; Try next is the button people press when it won't play.">
            {d.servers.length === 0 ? <p className="empty-note">No plays in this period.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Server</th>
                      <th scope="col" className="n">Plays</th>
                      <th scope="col" className="n">Finished</th>
                      <th scope="col" className="n">Switched away</th>
                      <th scope="col" className="n">Try next</th>
                      <th scope="col" className="n">Switch rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.servers.map((s) => {
                      const rate = s.plays ? s.switches / s.plays : 0
                      return (
                        <tr key={s.server}>
                          <th scope="row">{name(s.server)}</th>
                          <td className="n">{num(s.plays)}</td>
                          <td className="n">{num(s.finishes)}</td>
                          <td className="n">{num(s.switches)}</td>
                          <td className="n">{num(s.try_next)}</td>
                          <td className="n">
                            <span className={rate >= 0.5 ? 'flag bad' : rate >= 0.25 ? 'flag warn' : 'flag'}>
                              {s.plays ? pct(rate) : 'n/a'}{rate >= 0.5 ? ', often fails' : ''}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}
      </Loaded>
    </>
  )
}
