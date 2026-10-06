import { RotateCw, ShieldCheck } from 'lucide-react'
import { SERVERS, type Server } from '../api'
import Dropdown from './Dropdown'

// Shown as numbers, not provider names; numbering follows SERVERS (most reliable first).
const GROUPS = [{ label: 'Servers', items: SERVERS }]
export const serverLabel = (s: Server) => `Server ${SERVERS.indexOf(s) + 1}`

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
          {!s.popups && <ShieldCheck className="dd-safe" size={18} aria-label="No pop-ups" />}
        </>
      )}
      renderOption={(s) => <span className="dd-name">{serverLabel(s)}</span>}
    />
  )
}

export function TryNextServer({ value, onChange }: { value: Server; onChange: (id: string) => void }) {
  const next = SERVERS[(SERVERS.indexOf(value) + 1) % SERVERS.length]
  return (
    <button type="button" className="sp-next" onClick={() => onChange(next.id)}>
      <RotateCw size={16} aria-hidden="true" />
      Try next server
    </button>
  )
}
