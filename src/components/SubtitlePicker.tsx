import { type SubLang } from '../api'
import Dropdown from './Dropdown'

const LANGS: { id: SubLang; name: string }[] = [
  { id: 'he', name: 'Hebrew' },
  { id: 'en', name: 'English' },
]
const GROUPS = [{ label: 'Subtitles', items: LANGS }]

export default function SubtitlePicker({ value, onChange }: { value: SubLang; onChange: (lang: SubLang) => void }) {
  return (
    <Dropdown
      label="Subtitles"
      groups={GROUPS}
      value={LANGS.find((l) => l.id === value)}
      getKey={(l) => l.id}
      onChange={(l) => onChange(l.id)}
      renderValue={(l) => l && <span className="dd-name">{l.name}</span>}
      renderOption={(l) => <span className="dd-name">{l.name}</span>}
    />
  )
}
