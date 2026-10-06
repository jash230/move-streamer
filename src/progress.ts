import { useSyncExternalStore } from 'react'
import type { MediaType, Playback } from './api'

// Where each started title was left, kept in this browser only.
export interface Progress {
  id: string
  type: MediaType
  title: string
  poster_path: string | null
  backdrop_path: string | null
  date: string
  season?: number
  episode?: number
  // Seconds into the episode or movie; 0 with duration 0 means "up next, not started".
  position: number
  duration: number
  updatedAt: number
}

const KEY = 'cucuflix.progress.v1'
const MAX = 50
// A title joins Continue Watching after a minute of watching, and counts as finished at 90%.
export const MIN_WATCHED = 60
export const FINISHED_AT = 0.9

const keyOf = (type: MediaType, id: string) => `${type}-${id}`

let cache: Progress[] | undefined
const listeners = new Set<() => void>()

function read(): Record<string, Progress> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

function write(all: Record<string, Progress>) {
  const kept = Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept.map((p) => [keyOf(p.type, p.id), p]))))
  } catch { /* quota or privacy mode */ }
  changed()
}

function changed() {
  cache = undefined
  listeners.forEach((l) => l())
}

export const listProgress = () => (cache ??= Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt))

export const getProgress = (type: MediaType, id: string): Progress | undefined => read()[keyOf(type, id)]

export function saveProgress(p: Omit<Progress, 'updatedAt'>, now = Date.now()) {
  const all = read()
  all[keyOf(p.type, p.id)] = { ...p, updatedAt: now }
  write(all)
}

export function removeProgress(type: MediaType, id: string) {
  const all = read()
  if (!(keyOf(type, id) in all)) return
  delete all[keyOf(type, id)]
  write(all)
}

export const isFinished = (p: Playback) => Boolean(p.ended) || (p.duration > 0 && p.watched >= p.duration * FINISHED_AT)

type Title = Pick<Progress, 'id' | 'type' | 'title' | 'poster_path' | 'backdrop_path' | 'date'>

// Records a progress report from the player. A finished movie leaves the list; a finished episode is
// replaced by the next one (or leaves the list after the last one).
export function recordPlayback(
  title: Title,
  at: { season?: number; episode?: number },
  playback: Playback,
  next?: { season: number; episode: number },
) {
  if (isFinished(playback)) {
    if (next) saveProgress({ ...title, ...next, position: 0, duration: 0 })
    else removeProgress(title.type, title.id)
    return
  }
  if (playback.duration <= 0) return
  if (playback.watched < MIN_WATCHED && !getProgress(title.type, title.id)) return
  saveProgress({ ...title, season: at.season, episode: at.episode, position: playback.watched, duration: playback.duration })
}

// Other tabs saving progress show up here too.
const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) changed() }

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) window.removeEventListener('storage', onStorage)
  }
}

export const useContinueWatching = () => useSyncExternalStore(subscribe, listProgress, () => [])

export function formatTime(seconds: number) {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60))
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}
