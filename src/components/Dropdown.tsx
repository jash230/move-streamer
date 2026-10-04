import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface DropdownGroup<T> {
  label: string
  icon?: ReactNode
  items: T[]
}

// Accessible single-select listbox with grouped, multi-line options (a native <select> can only show plain text).
export default function Dropdown<T>({ label, groups, value, getKey, renderValue, renderOption, onChange, disabled, wide }: {
  label: string
  groups: DropdownGroup<T>[]
  value?: T
  getKey: (item: T) => string
  renderValue: (item?: T) => ReactNode
  renderOption: (item: T) => ReactNode
  onChange: (item: T) => void
  disabled?: boolean
  wide?: boolean
}) {
  // Visual order (grouped) drives keyboard navigation so arrows move the way the list looks.
  const ordered = groups.flatMap((g) => g.items)
  const valueIndex = () => Math.max(0, ordered.findIndex((o) => value !== undefined && getKey(o) === getKey(value)))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(valueIndex)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const uid = useId()
  const optionId = (i: number) => `${uid}-opt-${i}`

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    listRef.current?.focus()
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  }, [open, active]) // eslint-disable-line react-hooks/exhaustive-deps

  const openList = () => {
    setActive(valueIndex())
    setOpen(true)
  }

  const choose = (item: T) => {
    onChange(item)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openList()
    }
  }

  const onListKey = (e: KeyboardEvent) => {
    const last = ordered.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }
    if (e.key in moves) {
      e.preventDefault()
      setActive(moves[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(ordered[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  let index = -1

  return (
    <div className="picker">
      <span className="picker-label" id={`${uid}-label`}>{label}</span>
      <div className={wide ? 'dd wide' : 'dd'} ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className="dd-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${uid}-label ${uid}-value`}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openList())}
          onKeyDown={onTriggerKey}
        >
          <span className="dd-value" id={`${uid}-value`}>{renderValue(value)}</span>
          <ChevronDown className="dd-chevron" size={18} aria-hidden="true" />
        </button>

        {open && (
          <ul
            ref={listRef}
            className="dd-list"
            role="listbox"
            tabIndex={-1}
            aria-labelledby={`${uid}-label`}
            aria-activedescendant={optionId(active)}
            onKeyDown={onListKey}
          >
            {groups.map((g) => (
              <li key={g.label} role="presentation">
                <span className="dd-group" id={`${uid}-g-${g.label}`} aria-hidden="true">
                  {g.icon}
                  {g.label}
                </span>
                <ul role="group" aria-labelledby={`${uid}-g-${g.label}`}>
                  {g.items.map((item) => {
                    const i = ++index
                    const selected = value !== undefined && getKey(item) === getKey(value)
                    return (
                      <li
                        key={getKey(item)}
                        id={optionId(i)}
                        role="option"
                        aria-selected={selected}
                        className={`dd-option${i === active ? ' is-active' : ''}`}
                        onPointerMove={() => i !== active && setActive(i)}
                        onClick={() => choose(item)}
                      >
                        <span className="dd-option-body">{renderOption(item)}</span>
                        {selected && <Check className="dd-check" size={18} aria-hidden="true" />}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
