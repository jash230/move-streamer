import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTime, getProgress, listProgress, recordPlayback, removeProgress, saveProgress } from './progress'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const show = { id: '1399', type: 'tv' as const, title: 'Game of Thrones', poster_path: '/p.jpg', backdrop_path: null, date: '2011-04-17' }
const movie = { id: '550', type: 'movie' as const, title: 'Fight Club', poster_path: null, backdrop_path: null, date: '1999-10-15' }
const at = (watched: number, duration = 3600, ended?: boolean) => ({ watched, duration, ended })

beforeEach(() => store.clear())

describe('progress store', () => {
  it('lists titles newest first and removes them', () => {
    saveProgress({ ...movie, position: 100, duration: 8000 }, 1)
    saveProgress({ ...show, season: 1, episode: 2, position: 100, duration: 3600 }, 2)
    expect(listProgress().map((p) => p.id)).toEqual(['1399', '550'])
    removeProgress('tv', '1399')
    expect(listProgress().map((p) => p.id)).toEqual(['550'])
    expect(getProgress('tv', '1399')).toBeUndefined()
  })

  it('keeps only the 50 most recent titles', () => {
    for (let i = 0; i < 55; i++) saveProgress({ ...movie, id: String(i), position: 100, duration: 8000 }, i)
    const ids = listProgress().map((p) => p.id)
    expect(ids).toHaveLength(50)
    expect(ids[0]).toBe('54')
    expect(ids).not.toContain('4')
  })

  it('survives broken or missing storage', () => {
    store.set('cucuflix.progress.v1', '{not json')
    saveProgress({ ...movie, position: 100, duration: 8000 })
    expect(getProgress('movie', '550')?.position).toBe(100)
  })
})

describe('recordPlayback', () => {
  it('waits a minute before adding a title, then saves where it is', () => {
    recordPlayback(movie, {}, at(30, 8000))
    expect(getProgress('movie', '550')).toBeUndefined()
    recordPlayback(movie, {}, at(75, 8000))
    expect(getProgress('movie', '550')).toMatchObject({ position: 75, duration: 8000 })
    recordPlayback(movie, {}, at(20, 8000))
    expect(getProgress('movie', '550')?.position).toBe(20)
  })

  it('ignores reports without a known length', () => {
    recordPlayback(movie, {}, at(0, 0))
    expect(getProgress('movie', '550')).toBeUndefined()
  })

  it('drops a movie at 90% or when it ends', () => {
    recordPlayback(movie, {}, at(4000, 8000))
    recordPlayback(movie, {}, at(7300, 8000))
    expect(getProgress('movie', '550')).toBeUndefined()
    recordPlayback(movie, {}, at(4000, 8000))
    recordPlayback(movie, {}, at(0, 0, true))
    expect(getProgress('movie', '550')).toBeUndefined()
  })

  it('moves a finished episode on to the next one', () => {
    recordPlayback(show, { season: 1, episode: 10 }, at(3500), { season: 2, episode: 1 })
    expect(getProgress('tv', '1399')).toMatchObject({ season: 2, episode: 1, position: 0, duration: 0 })
  })

  it('drops a show after its last episode', () => {
    recordPlayback(show, { season: 8, episode: 6 }, at(600))
    recordPlayback(show, { season: 8, episode: 6 }, at(3600, 3600, true))
    expect(getProgress('tv', '1399')).toBeUndefined()
  })

  it('updates an up-next episode from its first second', () => {
    saveProgress({ ...show, season: 2, episode: 1, position: 0, duration: 0 })
    recordPlayback(show, { season: 2, episode: 1 }, at(5))
    expect(getProgress('tv', '1399')).toMatchObject({ season: 2, episode: 1, position: 5, duration: 3600 })
  })
})

it('formats resume times', () => {
  expect(formatTime(2470)).toBe('41:10')
  expect(formatTime(65)).toBe('1:05')
  expect(formatTime(3725)).toBe('1:02:05')
})
