import { describe, expect, it } from 'vitest'
import { playbackLeft, playbackProgress, type PlaybackTarget } from './api'

// Seconds left, bucketed the way the tests read best.
const playbackState = (raw: unknown, want: PlaybackTarget) => {
  const left = playbackLeft(raw, want)
  return left === null ? null : left < 1.5 ? 'ended' : 'playing'
}

const ep = { id: '1399', season: 1, episode: 1 }

// Shapes captured from the real players (trimmed).
const vidsrc = (status: string, progress: number, duration: number, info = { tmdb: '1399', season: 1, episode: 1 }) =>
  ({ type: 'PLAYER_EVENT', data: { player_info: { ...info, mediaType: 'tv' }, player_status: status, player_progress: progress, player_duration: duration } })

const progress = (watched: number, duration = 3697.1) => ({ watched, duration })
const show = (id: number | string, episodes: Record<string, number>, extra = {}) => ({
  id, type: 'tv',
  show_progress: Object.fromEntries(Object.entries(episodes).map(([k, w]) => [k, { progress: progress(w) }])),
  ...extra,
})

describe('playbackLeft', () => {
  it('reports the seconds left, so Up next can start before the end', () => {
    expect(playbackLeft(vidsrc('playing', 3687, 3697), ep)).toBe(10)
    expect(playbackLeft({ type: 'MEDIA_DATA', data: [show(1399, { s1e1: 3690.1 })] }, ep)).toBeCloseTo(7)
    expect(playbackLeft(vidsrc('playing', 0, 0), ep)).toBe(Infinity)
    expect(playbackLeft(vidsrc('completed', 3697.2, 3697), ep)).toBe(0)
  })

  it('reads VidSrc player events', () => {
    expect(playbackState(vidsrc('playing', 5, 3697), ep)).toBe('playing')
    expect(playbackState(vidsrc('playing', 0, 0), ep)).toBe('playing')
    expect(playbackState(vidsrc('completed', 3697.2, 3697), ep)).toBe('ended')
  })

  it('ignores VidSrc events for another episode', () => {
    expect(playbackState(vidsrc('completed', 3697, 3697, { tmdb: '1399', season: 1, episode: 2 }), ep)).toBeNull()
    expect(playbackState(vidsrc('completed', 3697, 3697, { tmdb: '42', season: 1, episode: 1 }), ep)).toBeNull()
  })

  it('reads VidRock MEDIA_DATA (array)', () => {
    expect(playbackState({ type: 'MEDIA_DATA', data: [show(1399, { s1e1: 12 })] }, ep)).toBe('playing')
    expect(playbackState({ type: 'MEDIA_DATA', data: [show(1399, { s1e1: 3697.1 })] }, ep)).toBe('ended')
  })

  it('reads VidZee MEDIA_DATA (keyed object), including as a JSON string', () => {
    const msg = { type: 'MEDIA_DATA', data: { 1399: show('1399', { s1e1: 3697.1 }) } }
    expect(playbackState(msg, ep)).toBe('ended')
    expect(playbackState(JSON.stringify(msg), ep)).toBe('ended')
  })

  it('only looks at the episode on screen, not the rest of the watch history', () => {
    const history = { type: 'MEDIA_DATA', data: [show(1399, { s1e1: 3697.1, s1e2: 30 }), show(42, { s1e1: 3697.1 })] }
    expect(playbackState(history, { id: '1399', season: 1, episode: 2 })).toBe('playing')
    expect(playbackState(history, { id: '1399', season: 1, episode: 3 })).toBeNull()
    expect(playbackState(history, { id: '7', season: 1, episode: 1 })).toBeNull()
  })

  it('uses the top-level progress for movies', () => {
    const movie = { type: 'MEDIA_DATA', data: { 550: { id: 550, type: 'movie', progress: progress(8338, 8339) } } }
    expect(playbackState(movie, { id: '550' })).toBe('ended')
  })

  it('still understands generic ended events and ignores noise', () => {
    expect(playbackState({ type: 'PLAYER_EVENT', data: { event: 'ended' } }, ep)).toBe('ended')
    expect(playbackState({ currentTime: 100, duration: 3000 }, ep)).toBe('playing')
    expect(playbackState({ type: 'PLAYER_UI', visible: true }, ep)).toBeNull()
    expect(playbackState('not json', ep)).toBeNull()
    expect(playbackState({ type: 'MEDIA_DATA', data: {} }, ep)).toBeNull()
  })
})

describe('playbackProgress', () => {
  it('reports where the player is, for saving progress', () => {
    expect(playbackProgress(vidsrc('playing', 1200, 3697), ep)).toEqual({ watched: 1200, duration: 3697 })
    expect(playbackProgress({ type: 'MEDIA_DATA', data: [show(1399, { s1e1: 900 })] }, ep)).toEqual({ watched: 900, duration: 3697.1 })
    expect(playbackProgress({ currentTime: 100, duration: 3000 }, ep)).toEqual({ watched: 100, duration: 3000 })
  })

  it('marks ends, and playing with no known length', () => {
    expect(playbackProgress(vidsrc('completed', 3697, 3697), ep)).toEqual({ watched: 3697, duration: 3697, ended: true })
    expect(playbackProgress({ data: { event: 'ended' } }, ep)).toMatchObject({ ended: true })
    expect(playbackProgress(vidsrc('playing', 0, 0), ep)).toEqual({ watched: 0, duration: 0 })
  })

  it('ignores other titles and episodes', () => {
    expect(playbackProgress(vidsrc('playing', 1200, 3697, { tmdb: '1399', season: 1, episode: 2 }), ep)).toBeNull()
    expect(playbackProgress({ type: 'MEDIA_DATA', data: [show(42, { s1e1: 900 })] }, ep)).toBeNull()
  })
})
