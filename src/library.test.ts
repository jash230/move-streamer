import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSaved, isWatched, listSaved, setWatched, toggleSaved, watchedKey } from './library'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const media = (id: number, media_type: 'movie' | 'tv' = 'movie') =>
  ({ id, media_type, title: `T${id}`, overview: '', poster_path: null, backdrop_path: null, vote_average: 7, popularity: 1, date: '2020-01-01' })

beforeEach(() => {
  store.clear()
  // Clear the stores' caches by writing through them.
  listSaved().forEach((m) => toggleSaved(m))
})

describe('My List', () => {
  it('adds and removes titles, newest first', () => {
    toggleSaved(media(1), 1)
    toggleSaved(media(2, 'tv'), 2)
    expect(listSaved().map((m) => m.id)).toEqual([2, 1])
    expect(isSaved('tv', 2)).toBe(true)
    expect(isSaved('movie', 2)).toBe(false)
    toggleSaved(media(2, 'tv'))
    expect(listSaved().map((m) => m.id)).toEqual([1])
  })

  it('keeps only the card fields', () => {
    toggleSaved({ ...media(3), genres: [{ id: 1, name: 'Drama' }] } as never, 5)
    expect(listSaved()[0]).toEqual({ ...media(3), addedAt: 5 })
  })
})

describe('watched', () => {
  it('keys movies and episodes apart', () => {
    expect(watchedKey('movie', 550)).toBe('movie-550')
    expect(watchedKey('tv', '1399', 1, 2)).toBe('tv-1399-1-2')
  })

  it('marks and unmarks', () => {
    setWatched('movie-550', true)
    expect(isWatched('movie-550')).toBe(true)
    setWatched('movie-550', false)
    expect(isWatched('movie-550')).toBe(false)
  })
})
