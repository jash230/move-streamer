import { ArrowDownRight, ArrowUpRight, Info as InfoIcon, Minus, RotateCw } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Sparkline } from './charts'
import { change } from './format'
import { useRange } from './useReport'

// One line under the page title saying what the page is for.
export function PageHead({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      {title && <h2 className="adm-page-title">{title}</h2>}
      {children && <p>{children}</p>}
    </header>
  )
}

// Explanations live behind a small (i) so cards stay clean; hover, focus or tap shows them.
export function Info({ children }: { children: ReactNode }) {
  const id = useId()
  return (
    <span className="tip">
      <button type="button" aria-describedby={id} aria-label="What this means"><InfoIcon size={15} aria-hidden="true" /></button>
      <span role="tooltip" id={id}>{children}</span>
    </span>
  )
}

export function Card({ title, info, action, children, className }: { title?: ReactNode; info?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      {(title || action) && (
        <header className="panel-head">
          {title && <h2>{title}{info && <Info>{info}</Info>}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

// Kept for pages that group a block under a heading with a hint line.
export function Section({ title, hint, children, wide }: { title: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <Card title={title} info={hint} className={wide ? 'wide' : undefined}>
      {children}
    </Card>
  )
}

// Change vs the previous period as a small pill; direction and whether up is good set the color,
// and the full sentence is there for screen readers and on hover.
export function Delta({ now, before, upIsGood = true }: { now: number; before: number | null | undefined; upIsGood?: boolean }) {
  const range = useRange()
  const d = change(now, before)
  if (d == null || !range.previous) return null
  const good = d === 0 ? null : (d > 0) === upIsGood
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus
  const sentence = `${d === 0 ? 'Same as' : `${Math.abs(d)}% ${d > 0 ? 'more than' : 'less than'}`} ${range.previous}`
  return (
    <span className={`delta ${good == null ? '' : good ? 'good' : 'bad'}`} title={sentence}>
      <Icon size={13} aria-hidden="true" />
      <span aria-hidden="true">{Math.abs(d)}%</span>
      <span className="sr-only">{sentence}</span>
    </span>
  )
}

export function Kpi(props: { label: string; value: ReactNode; info?: ReactNode; now?: number; before?: number | null; upIsGood?: boolean; spark?: number[]; foot?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-label">{props.label}</span>
        {props.info && <Info>{props.info}</Info>}
      </div>
      <div className="kpi-value-row">
        <span className="kpi-value">{props.value}</span>
        {props.now != null && <Delta now={props.now} before={props.before} upIsGood={props.upIsGood} />}
      </div>
      {props.spark && props.spark.length > 1 && <Sparkline values={props.spark} />}
      {props.foot && <span className="kpi-foot">{props.foot}</span>}
    </div>
  )
}

// Counts up to the live number once, then follows changes; reduced motion jumps straight there.
export function Ticker({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value)
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 700))
      setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    // Frames pause in background tabs; make sure the real number always lands.
    const done = setTimeout(() => { cancelAnimationFrame(raf); setShown(value); from.current = value }, 800)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [value])
  return <>{shown.toLocaleString('en')}</>
}

export function Problem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="problem" role="alert">
      <p>{message}</p>
      <button type="button" className="adm-btn" onClick={onRetry}><RotateCw size={16} aria-hidden="true" /> Try again</button>
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="adm-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${90 - i * 18}%` }} />)}
    </div>
  )
}

// Shared wrapper: first load shows skeletons, errors show a retry, refetches dim the old data.
export function Loaded<T>({ state, children, lines }: { state: { data?: T; error?: string; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; lines?: number }) {
  if (state.error && !state.data) return <Problem message={state.error} onRetry={state.reload} />
  if (!state.data) return <Skeleton lines={lines} />
  return <div className={state.loading ? 'refreshing' : undefined}>{children(state.data)}</div>
}
