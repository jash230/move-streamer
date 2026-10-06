import { RotateCw, ShieldCheck } from 'lucide-react'
import { SERVERS, type Server } from '../api'
import Dropdown from './Dropdown'

// Shown as numbers, not provider names; numbering follows the list's order (most reliable first).
const GROUPS = [
  { label: 'Servers', items: SERVERS.filter((s) => !s.torrent) },
  { label: 'Ad-free', icon: <ShieldCheck size={14} aria-hidden="true" />, items: SERVERS.filter((s) => s.torrent) },
].filter((g) => g.items.length > 0)

const ORDERED = GROUPS.flatMap((g) => g.items)
export const serverLabel = (s: Server) => `Server ${ORDERED.indexOf(s) + 1}`

export default function ServerPicker({ value, onChange }: { value: Server; onChange: (id: string) => void }) {
  return (
    <Dropdown
      label="Server"
      groups={GROUPS}
      value={value}
      getKey={(s) => s.id}
      onChange={(s) => onChange(s.id)}
      renderValue={(s) => s && (
        <>
          <span className="dd-name">{serverLabel(s)}</span>
          <span className="dd-note">{s.note}</span>
          {!s.popups && <ShieldCheck className="dd-safe" size={18} aria-label="No pop-ups" />}
        </>
      )}
      renderOption={(s) => (
        <span className="dd-line">
          <span className="dd-name">{serverLabel(s)}</span>
          <span className="dd-note">{s.note}</span>
        </span>
      )}
    />
  )
}

export function TryNextServer({ value, onChange }: { value: Server; onChange: (id: string) => void }) {
  const next = ORDERED[(ORDERED.indexOf(value) + 1) % ORDERED.length]
  return (
    <button type="button" className="sp-next" onClick={() => onChange(next.id)}>
      <RotateCw size={16} aria-hidden="true" />
      Try next server
    </button>
  )
}
