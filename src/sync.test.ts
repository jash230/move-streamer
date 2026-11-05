import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const { createSync, clearLocal, switchAccount, refresh } = await import('./sync')
const { isSaved, isWatched, listSaved, setWatched, toggleSaved } = await import('./library')
const { getProgress, listProgress, removeProgress, saveProgress } = await import('./progress')

type Row = Record<string, unknown>

// An in-memory stand-in for the three Supabase tables, keyed by primary key.
function fakeRemote() {
  const tables: Record<string, Map<string, Row>> = { progress: new Map(), my_list: new Map(), watched: new Map() }
  const pk = (row: Row, cols: string[]) => cols.map((c) => String(row[c])).join('|')
  const cols = (t: string) => (t === 'watched' ? ['user_id', 'key'] : ['user_id', 'media_type', 'tmdb_id'])
  const calls = { upsert: 0, remove: 0 }
  let failing = false
  return {
    tables,
    calls,
    fail: (on: boolean) => { failing = on },
    rows: (t: string) => [...tables[t].values()],
    async fetchAll(t: string, userId: string) {
      if (failing) throw new Error('offline')
      return [...tables[t].values()].filter((r) => r.user_id === userId).map((r) => ({ ...r }))
    },
    async upsert(t: string, rows: Row[]) {
      if (failing) throw new Error('offline')
      calls.upsert++
      for (const r of rows) tables[t].set(pk(r, cols(t)), { ...r })
    },
    async remove(t: string, match: Record<string, string>) {
      if (failing) throw new Error('offline')
      calls.remove++
      tables[t].delete(pk(match, cols(t)))
    },
  }
}

const media = (id: number, media_type: 'movie' | 'tv' = 'movie') =>
  ({ id, media_type, title: `T${id}`, overview: '', poster_path: null, backdrop_path: null, vote_average: 7, popularity: 1, date: '2020-01-01' })

const progress = (id: string, position: number, updatedAt: number) => {
  saveProgress({ id, type: 'tv', title: `Show ${id}`, poster_path: null, backdrop_path: null, date: '2020', season: 1, episode: 2, position, duration: 1000 }, updatedAt)
}

beforeEach(() => {
  store.clear()
  clearLocal()
})

describe('account sync', () => {
  it('folds signed-out history into the account on first sign-in', async () => {
    const remote = fakeRemote()
    remote.tables.my_list.set('u1|movie|9', { user_id: 'u1', media_type: 'movie', tmdb_id: '9', media: media(9), added_at: 5 })
    toggleSaved(media(1), 10)
    progress('42', 300, 100)
    setWatched('movie-7', true, 50)

    const sync = await switchAccount(remote, null, 'u1')
    expect(listSaved().map((m) => m.id).sort()).toEqual([1, 9])
    await sync!.flush()
    expect(remote.rows('my_list').map((r) => r.tmdb_id).sort()).toEqual(['1', '9'])
    expect(remote.rows('progress')).toMatchObject([{ user_id: 'u1', tmdb_id: '42', position: 300, season: 1, episode: 2 }])
    expect(remote.rows('watched')).toMatchObject([{ user_id: 'u1', key: 'movie-7', marked_at: 50 }])
    sync!.stop()
  })

  it('keeps the newer pause point when both sides have one', async () => {
    const remote = fakeRemote()
    remote.tables.progress.set('u1|tv|42', { user_id: 'u1', media_type: 'tv', tmdb_id: '42', title: 'Show 42', poster_path: null, backdrop_path: null, date: '2020', season: 1, episode: 3, position: 900, duration: 1000, updated_at: 200 })
    progress('42', 300, 100)
    const sync = await switchAccount(remote, null, 'u1')
    expect(getProgress('tv', '42')).toMatchObject({ position: 900, episode: 3, updatedAt: 200 })
    await sync!.flush()
    expect(remote.calls.upsert).toBe(0)
    sync!.stop()
  })

  it('sends changes and removals while signed in', async () => {
    const remote = fakeRemote()
    const sync = await switchAccount(remote, null, 'u1')
    toggleSaved(media(3, 'tv'), 1)
    progress('5', 120, 1)
    progress('5', 240, 2)
    await sync!.flush()
    expect(remote.rows('progress')).toMatchObject([{ tmdb_id: '5', position: 240 }])
    expect(remote.calls.upsert).toBeLessThanOrEqual(2)

    toggleSaved(media(3, 'tv'))
    removeProgress('tv', '5')
    await sync!.flush()
    expect(remote.rows('my_list')).toEqual([])
    expect(remote.rows('progress')).toEqual([])
    sync!.stop()
  })

  it('treats the account as the truth on later pulls, keeping unsent changes', async () => {
    const remote = fakeRemote()
    const sync = await switchAccount(remote, null, 'u1')
    toggleSaved(media(1), 1)
    await sync!.flush()
    // Another device removes it and adds something else.
    remote.tables.my_list.clear()
    remote.tables.my_list.set('u1|movie|2', { user_id: 'u1', media_type: 'movie', tmdb_id: '2', media: media(2), added_at: 3 })
    setWatched('movie-2', true, 4) // not sent yet
    await refresh(sync!, 'u1')
    expect(listSaved().map((m) => m.id)).toEqual([2])
    expect(isWatched('movie-2')).toBe(true)
    await sync!.flush()
    expect(remote.rows('watched')).toHaveLength(1)
    sync!.stop()
  })

  it('retries changes that failed to send', async () => {
    const remote = fakeRemote()
    const sync = await switchAccount(remote, null, 'u1')
    remote.fail(true)
    toggleSaved(media(8), 1)
    await expect(sync!.flush()).rejects.toThrow()
    remote.fail(false)
    await sync!.flush()
    expect(remote.rows('my_list')).toHaveLength(1)
    sync!.stop()
  })

  it('clears this browser on sign-out and when someone else signs in', async () => {
    const remote = fakeRemote()
    let sync = await switchAccount(remote, null, 'u1')
    toggleSaved(media(1), 1)
    await sync!.flush()
    sync = await switchAccount(remote, sync, null)
    expect(sync).toBeNull()
    expect(listSaved()).toEqual([])
    expect(remote.rows('my_list')).toHaveLength(1) // signing out doesn't delete the account's copy

    sync = await switchAccount(remote, null, 'u1')
    expect(isSaved('movie', 1)).toBe(true)
    sync = await switchAccount(remote, sync, 'u2')
    expect(listSaved()).toEqual([])
    expect(listProgress()).toEqual([])
    sync!.stop()
  })

  it('keeps working when the account is unreachable at sign-in', async () => {
    const remote = fakeRemote()
    remote.fail(true)
    toggleSaved(media(4), 1)
    const sync = await switchAccount(remote, null, 'u1')
    expect(isSaved('movie', 4)).toBe(true)
    remote.fail(false)
    await refresh(sync!, 'u1')
    await sync!.flush()
    expect(remote.rows('my_list')).toHaveLength(1)
    sync!.stop()
  })

  it('batches a burst of progress reports into one upsert', async () => {
    const remote = fakeRemote()
    const sync = createSync(remote, 'u1')
    await sync.pull('cloud')
    for (let t = 1; t <= 10; t++) progress('9', t * 10, t)
    await sync.flush()
    expect(remote.calls.upsert).toBe(1)
    expect(remote.rows('progress')).toMatchObject([{ position: 100 }])
    sync.stop()
  })
})
