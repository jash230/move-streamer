export type MediaType = 'movie' | 'tv'

export interface Media {
  id: number
  media_type: MediaType
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  popularity: number
  date: string
}

export interface Season {
  season_number: number
  name: string
  episode_count: number
}

export interface Details extends Media {
  genres: { id: number; name: string }[]
  runtime?: number
  seasons?: Season[]
  imdb_id?: string
}

export interface Episode {
  episode_number: number
  name: string
  overview: string
  still_path: string | null
}

const RAW_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined
const TMDB_KEY = RAW_KEY && RAW_KEY !== 'your_tmdb_v3_api_key' ? RAW_KEY : undefined
const VIDSRC_BASE = ((import.meta.env.VITE_VIDSRC_BASE as string | undefined) ?? 'https://vidsrc.sh').replace(/\/$/, '')

// Production builds use the server-side proxy, which holds the key.
export const hasApiKey = Boolean(TMDB_KEY) || import.meta.env.PROD

export const img = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  // Production goes through /api/tmdb so the key stays server-side; local dev calls TMDB directly.
  const direct = Boolean(TMDB_KEY)
  const url = direct ? new URL(`https://api.themoviedb.org/3${path}`) : new URL('/api/tmdb', window.location.origin)
  const headers: HeadersInit = {}
  if (!direct) url.searchParams.set('path', path)
  // Long keys are v4 read-access tokens; short ones are v3 api keys.
  else if (TMDB_KEY!.length > 40) headers.Authorization = `Bearer ${TMDB_KEY}`
  else url.searchParams.set('api_key', TMDB_KEY!)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${res.statusText}`)
  return res.json()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any, fallbackType?: MediaType): Media {
  const media_type: MediaType = raw.media_type ?? fallbackType ?? (raw.title ? 'movie' : 'tv')
  return {
    id: raw.id,
    media_type,
    title: raw.title ?? raw.name ?? 'Untitled',
    overview: raw.overview ?? '',
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    vote_average: raw.vote_average ?? 0,
    popularity: raw.popularity ?? 0,
    date: raw.release_date ?? raw.first_air_date ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = { results: any[] }

// News, reality, talk and soap shows are almost never carried by the players, and unreleased
// titles have nothing to play yet, so neither gets advertised.
const UNSTREAMABLE_GENRES = new Set([10763, 10764, 10766, 10767])
const FAMOUS_TV = { 'vote_count.gte': '1500', without_genres: [...UNSTREAMABLE_GENRES, 16].join(',') }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function streamable(raw: any) {
  const date: string = raw.release_date ?? raw.first_air_date ?? ''
  const genres: number[] = raw.genre_ids ?? []
  return date !== '' && date <= new Date().toISOString().slice(0, 10) && !genres.some((g) => UNSTREAMABLE_GENRES.has(g))
}

export const getList = async (path: string, type: MediaType) =>
  (await tmdb<Page>(path)).results.filter(streamable).map((r) => normalize(r, type))

export const getTrending = async () =>
  (await tmdb<Page>('/trending/all/week')).results
    .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && streamable(r))
    .map((r) => normalize(r))

// Well-known shows only: enough votes to be famous, no daily/talk/news filler.
export const getFamousTv = async (sort: string) =>
  (await tmdb<Page>('/discover/tv', { ...FAMOUS_TV, sort_by: sort })).results.filter(streamable).map((r) => normalize(r, 'tv'))

const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// How closely a title matches what was typed: exact, prefix, word prefix, substring, anything else.
function matchTier(title: string, query: string) {
  const t = fold(title)
  if (t === query) return 4
  if (t.startsWith(query)) return 3
  if (` ${t}`.includes(` ${query}`)) return 2
  if (t.includes(query)) return 1
  return 0
}

// TMDB only matches whole words ("dun" never finds Dune), so the best-known and trending
// titles are also prefix-matched locally to make suggestions useful mid-word.
const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const POOL_SOURCES: [string, MediaType | undefined, Record<string, string>, number][] = [
  ['/trending/all/week', undefined, {}, 3],
  ['/movie/popular', 'movie', {}, 3],
  ['/tv/popular', 'tv', {}, 3],
  ['/discover/movie', 'movie', { sort_by: 'vote_count.desc' }, 10],
  ['/discover/tv', 'tv', { sort_by: 'vote_count.desc' }, 10],
]
const POOL_KEY = 'search-pool-v1'
const POOL_TTL = 24 * 60 * 60 * 1000
let pool: Promise<Media[]> | undefined

function loadPool(): Promise<Media[]> {
  try {
    const saved = JSON.parse(localStorage.getItem(POOL_KEY) ?? 'null') as { at: number; items: Media[] } | null
    if (saved && Date.now() - saved.at < POOL_TTL) return Promise.resolve(saved.items)
  } catch { /* storage unavailable; refetch */ }
  return Promise.allSettled(
    POOL_SOURCES.flatMap(([path, type, params, pages]) =>
      range(pages).map((page) =>
        tmdb<Page>(path, { ...params, page }).then(({ results }) =>
          results.filter((r) => type || r.media_type === 'movie' || r.media_type === 'tv').map((r) => ({ ...normalize(r, type), overview: '' })),
        ),
      ),
    ),
  ).then((pages) => {
    const items = pages.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
    try {
      if (pages.every((p) => p.status === 'fulfilled')) localStorage.setItem(POOL_KEY, JSON.stringify({ at: Date.now(), items }))
    } catch { /* quota or privacy mode */ }
    return items
  })
}

export const warmSearch = () => (pool ??= loadPool())

const searchCache = new Map<string, Promise<Media[]>>()

export function search(query: string) {
  const key = fold(query)
  let hit = searchCache.get(key)
  if (!hit) {
    const remote = tmdb<Page>('/search/multi', { query, include_adult: 'false' }).then(({ results }) =>
      results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => normalize(r)),
    )
    const local = warmSearch().then((all) => all.filter((m) => matchTier(m.title, key) > 0))
    hit = Promise.all([remote, local]).then(([r, l]) => {
      const seen = new Set<string>()
      return [...l, ...r]
        .filter((m) => !seen.has(`${m.media_type}-${m.id}`) && seen.add(`${m.media_type}-${m.id}`))
        // Match quality first, but a famous title starting with the query beats an obscure exact match.
        .map((m) => ({ m, score: matchTier(m.title, key) + 1.2 * Math.log10(1 + m.popularity) }))
        .sort((a, b) => b.score - a.score)
        .map(({ m }) => m)
    })
    hit.catch(() => searchCache.delete(key))
    searchCache.set(key, hit)
  }
  return hit
}

export async function getDetails(type: MediaType, id: string): Promise<Details> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await tmdb<any>(`/${type}/${id}`, { append_to_response: 'external_ids' })
  return {
    ...normalize(raw, type),
    genres: raw.genres ?? [],
    runtime: raw.runtime,
    seasons: raw.seasons?.filter((s: Season) => s.season_number > 0 && s.episode_count > 0),
    imdb_id: raw.imdb_id ?? raw.external_ids?.imdb_id ?? undefined,
  }
}

export const getEpisodes = async (id: string, season: number) =>
  (await tmdb<{ episodes: Episode[] }>(`/tv/${id}/season/${season}`)).episodes

// Titles produced in a given country (ISO 3166-1, e.g. IL for Israel).
export const discoverByCountry = async (type: MediaType, country: string, sort = 'popularity.desc') =>
  (await tmdb<Page>(`/discover/${type}`, { with_origin_country: country, sort_by: sort, 'vote_count.gte': '5' })).results.map(
    (r) => normalize(r, type),
  )

export interface Server {
  id: string
  name: string
  popups: boolean
  url: (type: MediaType, id: string, season: number, episode: number) => string
}

// Embed players, each a separate source, ordered by how reliably they played in a real-browser
// test on 2026-10-06 (Inception, The Dark Knight, Breaking Bad, Friends). Dropped: Videasy, VidFast,
// SuperEmbed, 2Embed, VidSrc.to and others that played none of them, and VidSrc mirrors that
// duplicate Server 1. Third-party players refuse to run in a sandboxed iframe, so pop-ups can't
// be blocked from our side.
export const SERVERS: Server[] = [
  {
    id: 'vidsrc',
    name: 'VidSrc',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `${VIDSRC_BASE}/embed/movie?tmdb=${id}`
        : `${VIDSRC_BASE}/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'vidrock',
    name: 'VidRock',
    popups: false,
    url: (type, id, s, e) =>
      type === 'movie' ? `https://vidrock.net/movie/${id}?autoplay=true` : `https://vidrock.net/tv/${id}/${s}/${e}?autoplay=true`,
  },
  {
    id: 'vidzee',
    name: 'VidZee',
    popups: false,
    url: (type, id, s, e) =>
      type === 'movie' ? `https://player.vidzee.wtf/embed/movie/${id}` : `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://vidlink.pro/movie/${id}?primaryColor=E11D48&autoplay=true`
        : `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E11D48&nextbutton=true&autoplay=true`,
  },
]

export interface PlaybackTarget { id: string; season?: number; episode?: number }

const atEnd = (watched: unknown, duration: unknown): 'ended' | 'playing' | null =>
  typeof watched === 'number' && typeof duration === 'number' && duration > 60
    ? duration - watched < 1.5 ? 'ended' : 'playing'
    : null

// Embed players report playback through postMessage, each in its own shape:
// - VidSrc: { type: 'PLAYER_EVENT', data: { player_info: { tmdb, season, episode }, player_status: 'completed', player_progress, player_duration } }
// - VidRock / VidZee / VidLink: { type: 'MEDIA_DATA', data } with data an array or an id-keyed object of saved
//   titles, each with show_progress['s1e2'].progress (TV) or progress (movies) as { watched, duration }.
//   That's the player's whole watch history, so only the entry for the title and episode on screen counts.
// - Others: { data: { event: 'ended' } } or { currentTime, duration }.
export function playbackState(raw: unknown, want: PlaybackTarget): 'ended' | 'playing' | null {
  let d = raw
  if (typeof d === 'string') {
    try { d = JSON.parse(d) } catch { return null }
  }
  if (!d || typeof d !== 'object') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = d as any
  const tv = want.season !== undefined && want.episode !== undefined

  if (m.type === 'MEDIA_DATA') {
    const entries: unknown[] = Array.isArray(m.data) ? m.data : Object.values(m.data ?? {})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = entries.find((x: any) => String(x?.id) === want.id) as any
    const p = tv ? entry?.show_progress?.[`s${want.season}e${want.episode}`]?.progress : entry?.progress
    return atEnd(p?.watched, p?.duration)
  }

  const info = m.data?.player_info
  if (info && (String(info.tmdb) !== want.id || (tv && (Number(info.season) !== want.season || Number(info.episode) !== want.episode)))) return null
  const status = m.data?.player_status
  if (status === 'completed' || status === 'ended') return 'ended'
  if (typeof status === 'string') return atEnd(m.data.player_progress, m.data.player_duration) ?? 'playing'

  const event = m.data?.event ?? m.event
  if (event === 'ended' || event === 'complete') return 'ended'
  return atEnd(m.data?.currentTime ?? m.currentTime ?? m.timestamp, m.data?.duration ?? m.duration)
}

const baseDomain = (host: string) => host.split('.').slice(-2).join('.')
export const sameSite = (origin: string, url: string) => {
  try {
    return baseDomain(new URL(origin).hostname) === baseDomain(new URL(url).hostname)
  } catch {
    return false
  }
}
