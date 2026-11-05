import type { SupabaseClient } from '@supabase/supabase-js'
import { listStore, watchedStore, type Saved } from './library'
import { progressStore, type Progress } from './progress'

// Keeps a signed-in viewer's Continue Watching, My List and watched marks in their Supabase account.
// The local stores stay what the site reads (instant, and the same code path signed in or out); this
// file mirrors every local change to the cloud and pulls the cloud copy in on sign-in and on focus.

type Row = Record<string, unknown>

export interface Remote {
  fetchAll(table: string, userId: string): Promise<Row[]>
  upsert(table: string, rows: Row[], onConflict: string): Promise<void>
  remove(table: string, match: Record<string, string>): Promise<void>
}

export interface Store<T> {
  get(): Record<string, T>
  write(all: Record<string, T>): void
  subscribe(listener: () => void): () => void
}

export interface Table<T> {
  name: string
  store: Store<T>
  conflict: string
  toRow(key: string, value: T): Row
  fromRow(row: Row): [string, T]
  match(key: string): Record<string, string>
  // On first sign-in, whether this browser's copy should replace the account's.
  newer(local: T, remote: T): boolean
}

// `pull` modes: 'union' folds this browser's signed-out history into the account (first sign-in);
// 'cloud' treats the account as the truth, keeping only changes not yet sent.
export type PullMode = 'union' | 'cloud'

const splitKey = (key: string) => {
  const i = key.indexOf('-')
  return { media_type: key.slice(0, i), tmdb_id: key.slice(i + 1) }
}

// Same value, same string, whatever order the fields were written in.
const stable = (v: unknown) =>
  v && typeof v === 'object' ? JSON.stringify(v, Object.keys(v as object).sort()) : JSON.stringify(v)

export const progressTable: Table<Progress> = {
  name: 'progress',
  store: progressStore,
  conflict: 'user_id,media_type,tmdb_id',
  toRow: (_, p) => ({
    media_type: p.type,
    tmdb_id: p.id,
    title: p.title,
    poster_path: p.poster_path,
    backdrop_path: p.backdrop_path,
    date: p.date,
    season: p.season ?? null,
    episode: p.episode ?? null,
    position: p.position,
    duration: p.duration,
    updated_at: p.updatedAt,
  }),
  fromRow: (r) => {
    const p: Progress = {
      id: String(r.tmdb_id),
      type: r.media_type as Progress['type'],
      title: String(r.title),
      poster_path: (r.poster_path as string | null) ?? null,
      backdrop_path: (r.backdrop_path as string | null) ?? null,
      date: String(r.date ?? ''),
      position: Number(r.position),
      duration: Number(r.duration),
      updatedAt: Number(r.updated_at),
    }
    if (r.season != null) p.season = Number(r.season)
    if (r.episode != null) p.episode = Number(r.episode)
    return [`${p.type}-${p.id}`, p]
  },
  match: splitKey,
  newer: (local, remote) => local.updatedAt > remote.updatedAt,
}

export const listTable: Table<Saved> = {
  name: 'my_list',
  store: listStore,
  conflict: 'user_id,media_type,tmdb_id',
  toRow: (_, { addedAt, ...media }) => ({ media_type: media.media_type, tmdb_id: String(media.id), media, added_at: addedAt }),
  fromRow: (r) => {
    const media = r.media as Omit<Saved, 'addedAt'>
    const saved: Saved = { ...media, id: Number(r.tmdb_id), media_type: r.media_type as Saved['media_type'], addedAt: Number(r.added_at) }
    return [`${saved.media_type}-${saved.id}`, saved]
  },
  match: splitKey,
  newer: () => false,
}

export const watchedTable: Table<number> = {
  name: 'watched',
  store: watchedStore,
  conflict: 'user_id,key',
  toRow: (key, at) => ({ key, marked_at: at }),
  fromRow: (r) => [String(r.key), Number(r.marked_at)],
  match: (key) => ({ key }),
  newer: () => false,
}

const FLUSH_AFTER_MS = 5000

function tableSync<T>(table: Table<T>, remote: Remote, userId: string, schedule: () => void) {
  // What the account holds, as far as this browser knows; local changes are diffed against it.
  let known: Record<string, string> = {}
  const pending = new Map<string, T | null>()
  let applying = false

  const diff = () => {
    if (applying) return
    const now = table.store.get()
    let changed = false
    for (const [k, v] of Object.entries(now)) {
      const s = stable(v)
      if (known[k] !== s) {
        known[k] = s
        pending.set(k, v)
        changed = true
      }
    }
    for (const k of Object.keys(known)) {
      if (!(k in now)) {
        delete known[k]
        pending.set(k, null)
        changed = true
      }
    }
    if (changed) schedule()
  }

  const unsubscribe = table.store.subscribe(diff)

  async function flush() {
    if (!pending.size) return
    const ops = [...pending]
    pending.clear()
    const upserts = ops.filter((op): op is [string, T] => op[1] !== null)
    const deletes = ops.filter(([, v]) => v === null).map(([k]) => k)
    const failed: [string, T | null][] = []
    if (upserts.length) {
      try {
        await remote.upsert(table.name, upserts.map(([k, v]) => ({ ...table.toRow(k, v), user_id: userId })), table.conflict)
      } catch {
        failed.push(...upserts)
      }
    }
    for (const k of deletes) {
      try {
        await remote.remove(table.name, { ...table.match(k), user_id: userId })
      } catch {
        failed.push([k, null])
      }
    }
    // Retry later, unless something newer was queued for the same title meanwhile.
    for (const [k, v] of failed) if (!pending.has(k)) pending.set(k, v)
    if (failed.length) throw new Error(`Couldn't save ${table.name}`)
  }

  async function pull(mode: PullMode) {
    const rows = await remote.fetchAll(table.name, userId)
    const cloud = Object.fromEntries(rows.map(table.fromRow))
    const local = table.store.get()
    const merged: Record<string, T> = { ...cloud }
    if (mode === 'union') {
      for (const [k, v] of Object.entries(local)) if (!(k in cloud) || table.newer(v, cloud[k])) merged[k] = v
    } else {
      for (const [k, v] of pending) {
        if (v === null) delete merged[k]
        else merged[k] = v
      }
    }
    // Start from what the cloud holds, write the merged copy locally, then let the diff queue
    // whatever the cloud is missing (including titles the local store trims off).
    known = Object.fromEntries(Object.entries(cloud).map(([k, v]) => [k, stable(v)]))
    pending.clear()
    applying = true
    try {
      table.store.write(merged)
    } finally {
      applying = false
    }
    diff()
  }

  return { flush, pull, stop: unsubscribe, hasPending: () => pending.size > 0 }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = Table<any>

export function createSync(remote: Remote, userId: string, tables: AnyTable[] = TABLES) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    timer ??= setTimeout(() => {
      timer = undefined
      void flush().catch(() => schedule())
    }, FLUSH_AFTER_MS)
  }
  const syncs = tables.map((t) => tableSync(t, remote, userId, schedule))

  async function flush() {
    clearTimeout(timer)
    timer = undefined
    const results = await Promise.allSettled(syncs.map((s) => s.flush()))
    if (results.some((r) => r.status === 'rejected')) throw new Error('Some changes were not saved yet')
  }

  return {
    flush,
    pull: (mode: PullMode) => Promise.all(syncs.map((s) => s.pull(mode))).then(() => undefined),
    stop() {
      clearTimeout(timer)
      timer = undefined
      syncs.forEach((s) => s.stop())
    },
    hasPending: () => syncs.some((s) => s.hasPending()),
  }
}

export type Sync = ReturnType<typeof createSync>

export const TABLES: AnyTable[] = [progressTable, listTable, watchedTable]

export function supabaseRemote(client: SupabaseClient): Remote {
  const PAGE = 1000
  return {
    async fetchAll(table, userId) {
      const rows: Row[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.from(table).select('*').eq('user_id', userId).range(from, from + PAGE - 1)
        if (error) throw error
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) return rows
      }
    },
    async upsert(table, rows, onConflict) {
      const { error } = await client.from(table).upsert(rows, { onConflict })
      if (error) throw error
    },
    async remove(table, match) {
      const { error } = await client.from(table).delete().match(match)
      if (error) throw error
    },
  }
}

// Which account the local stores currently hold. Unset means signed-out history.
const OWNER_KEY = 'cucuflix.sync.owner'

const readOwner = () => {
  try { return localStorage.getItem(OWNER_KEY) } catch { return null }
}
const writeOwner = (id: string | null) => {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id)
    else localStorage.removeItem(OWNER_KEY)
  } catch { /* privacy mode */ }
}

export const clearLocal = (tables: AnyTable[] = TABLES) => tables.forEach((t) => t.store.write({}))

// Switches the local stores to `userId`'s account (or back to signed out with `null`).
// Returns the running sync, if any.
export async function switchAccount(remote: Remote, current: Sync | null, userId: string | null): Promise<Sync | null> {
  current?.stop()
  const owner = readOwner()
  if (!userId) {
    // Signed out: don't leave this viewer's history for whoever uses the browser next.
    if (owner) clearLocal()
    writeOwner(null)
    return null
  }
  if (owner && owner !== userId) {
    clearLocal()
    writeOwner(null)
  }
  const sync = createSync(remote, userId)
  // If the account can't be reached yet, changes still queue up; refresh() tries again later.
  await refresh(sync, userId).catch(() => {})
  return sync
}

// Pulls the account into this browser: a full merge the first time, the account's copy after that.
export async function refresh(sync: Sync, userId: string) {
  await sync.pull(readOwner() === userId ? 'cloud' : 'union')
  writeOwner(userId)
}
