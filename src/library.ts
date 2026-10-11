import { useMemo, useSyncExternalStore } from 'react'
import type { Media, MediaType } from './api'

// Titles saved for later and what's been watched, kept in this browser only (like progress.ts).

function localStore<T>(key: string) {
  const EMPTY: Record<string, T> = {}
  let cache: Record<string, T> | undefined
  const listeners = new Set<() => void>()
  const changed = () => {
    cache = undefined
    listeners.forEach((l) => l())
  }
  const get = () => (cache ??= (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}')
      return saved && typeof saved === 'object' ? saved : EMPTY
    } catch {
      return EMPTY
    }
  })())
  const write = (all: Record<string, T>) => {
    try { localStorage.setItem(key, JSON.stringify(all)) } catch { /* quota or privacy mode */ }
    changed()
  }
  // Other tabs saving show up here too.
  const onStorage = (e: StorageEvent) => { if (e.key === key || e.key === null) changed() }
  const subscribe = (listener: () => void) => {
    if (!listeners.size) window.addEventListener('storage', onStorage)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) window.removeEventListener('storage', onStorage)
    }
  }
  const use = () => useSyncExternalStore(subscribe, get, () => EMPTY)
  return { get, write, use }
}

const keyOf = (type: MediaType, id: string | number) => `${type}-${id}`

// ---------- My List ----------

export interface Saved extends Media { addedAt: number }

const list = localStore<Saved>('cucuflix.list.v1')

const newestFirst = (all: Record<string, Saved>) => Object.values(all).sort((a, b) => b.addedAt - a.addedAt)

export const listSaved = () => newestFirst(list.get())

export const isSaved = (type: MediaType, id: string | number) => keyOf(type, id) in list.get()

export function toggleSaved(m: Media, now = Date.now()) {
  const all = { ...list.get() }
  const k = keyOf(m.media_type, m.id)
  if (k in all) delete all[k]
  else {
    const { id, media_type, title, overview, poster_path, backdrop_path, vote_average, popularity, date } = m
    all[k] = { id, media_type, title, overview, poster_path, backdrop_path, vote_average, popularity, date, addedAt: now }
  }
  list.write(all)
}

export function useMyList() {
  const all = list.use()
  return useMemo(() => newestFirst(all), [all])
}

export function useSaved(type: MediaType, id: string | number) {
  return keyOf(type, id) in list.use()
}

// ---------- Watched ----------

// Movies are `movie-550`, episodes `tv-1399-1-2`; the value is when it was marked.
const watched = localStore<number>('cucuflix.watched.v1')

export const watchedKey = (type: MediaType, id: string | number, season?: number, episode?: number) =>
  type === 'tv' && season !== undefined ? `${keyOf(type, id)}-${season}-${episode}` : keyOf(type, id)

export const isWatched = (key: string) => key in watched.get()

export function setWatched(key: string, on: boolean, now = Date.now()) {
  if (on === isWatched(key)) return
  const all = { ...watched.get() }
  if (on) all[key] = now
  else delete all[key]
  watched.write(all)
}

export const useWatched = () => watched.use()
