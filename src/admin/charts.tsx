import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { num, pct } from './format'

// ---------- Trend (single series line + 10% area wash, crosshair tooltip) ----------

export interface TrendPoint {
  label: string
  short: string
  value: number
}

const H = 220
const PAD = { top: 12, right: 12, bottom: 28, left: 44 }

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].find((s) => (s * p * 4) >= v)! * p
  return step * 4
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.max(280, el.clientWidth))
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function TrendChart({ points, name, unit }: { points: TrendPoint[]; name: string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length < 2 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 72))))

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - box.left) / box.width) * width
    const i = Math.round(((rel - PAD.left) / innerW) * (points.length - 1))
    setActive(Math.min(points.length - 1, Math.max(0, i)))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setActive((a) => Math.min(points.length - 1, Math.max(0, (a ?? points.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))))
  }

  const total = points.reduce((s, p) => s + p.value, 0)
  const a = active == null ? null : points[active]
  if (!width) return <div className="trend" ref={ref} style={{ height: H }} />
  return (
    <div className="trend" ref={ref}>
      <div
        className="trend-plot"
        tabIndex={0}
        role="img"
        aria-label={`${name} per ${unit}, ${num(total)} in total. Use the left and right arrow keys to read each ${unit}.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} onPointerMove={pick} onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{num(t)}</text>
            </g>
          ))}
          {points.map((p, i) => ((i % every === 0 && points.length - 1 - i > every / 2) || i === points.length - 1) && (
            <text key={p.label} className="tick" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{p.short}</text>
          ))}
          <path className="area" d={area} />
          <path className="line" d={line} />
          {a && active != null && (
            <>
              <line className="crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} />
              <circle className="marker" cx={x(active)} cy={y(a.value)} r={5} />
            </>
          )}
          {!a && points.length > 0 && <circle className="marker" cx={x(points.length - 1)} cy={y(points[points.length - 1].value)} r={4} />}
        </svg>
        {a && active != null && (
          <div className="tooltip" style={{ left: Math.min(width - 150, Math.max(0, x(active) - 70)) }} aria-live="polite">
            <strong>{num(a.value)}</strong>
            <span>{name} · {a.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Ranked bars (label, bar, value at the tip) ----------

export interface BarItem {
  key: string
  label: ReactNode
  value: number
  note?: ReactNode
}

// `of` sets the full-bar value (e.g. the cohort size for percentages); by default the longest bar is full.
export function BarList({ items, empty = 'Nothing here yet for this period.', format = num, of }: { items: BarItem[]; empty?: string; format?: (n: number) => string; of?: number }) {
  if (!items.length) return <p className="empty-note">{empty}</p>
  const max = of ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <ol className="bars">
      {items.map((it) => (
        <li key={it.key}>
          <div className="bar-text">
            <span className="bar-label">{it.label}</span>
            <span className="bar-value">{format(it.value)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%` }} />
          </div>
          {it.note && <div className="bar-note">{it.note}</div>}
        </li>
      ))}
    </ol>
  )
}

// ---------- Funnel (sequential steps, conversion shown as text, biggest drop called out) ----------

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1)
  const drops = steps.slice(1).map((s, i) => (steps[i].value ? 1 - s.value / steps[i].value : 0))
  const worst = drops.indexOf(Math.max(...drops))
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          {i > 0 && (
            <p className={i - 1 === worst && drops[worst] > 0 ? 'funnel-drop worst' : 'funnel-drop'}>
              {steps[i - 1].value ? `${pct(s.value / steps[i - 1].value)} continued` : 'No one reached this step'}
              {i - 1 === worst && drops[worst] > 0 && <span> · biggest drop-off</span>}
            </p>
          )}
          <div className="funnel-row">
            <span className="funnel-label">{s.label}</span>
            <span className="funnel-value">{num(s.value)}</span>
          </div>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${Math.max(1.5, (s.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------- Sparkline (decorative trend inside a KPI card; the card's number carries the value) ----------

export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(2)},${(30 - (v / max) * 26).toFixed(2)}`)
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="spark-area" points={`0,32 ${pts.join(' ')} 100,32`} />
      <polyline className="spark-line" points={pts.join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
