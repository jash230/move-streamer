export type MediaType = 'movie' | 'tv'

export interface Media {
  id: number
  media_type: MediaType
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
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
}

export interface Episode {
  episode_number: number
  name: string
  overview: string
  still_path: string | null
}

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined
const VIDSRC_BASE = ((import.meta.env.VITE_VIDSRC_BASE as string | undefined) ?? 'https://vidsrc.sh').replace(/\/$/, '')

export const hasApiKey = Boolean(TMDB_KEY && TMDB_KEY !== 'your_tmdb_v3_api_key')

export const img = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  const headers: HeadersInit = {}
  // Long keys are v4 read-access tokens; short ones are v3 api keys.
  if (TMDB_KEY && TMDB_KEY.length > 40) headers.Authorization = `Bearer ${TMDB_KEY}`
  else if (TMDB_KEY) url.searchParams.set('api_key', TMDB_KEY)
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
    date: raw.release_date ?? raw.first_air_date ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = { results: any[] }

export const getList = async (path: string, type: MediaType) =>
  (await tmdb<Page>(path)).results.map((r) => normalize(r, type))

export const getTrending = async () =>
  (await tmdb<Page>('/trending/all/week')).results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalize(r))

export const search = async (query: string) =>
  (await tmdb<Page>('/search/multi', { query, include_adult: 'false' })).results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalize(r))

export async function getDetails(type: MediaType, id: string): Promise<Details> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await tmdb<any>(`/${type}/${id}`)
  return {
    ...normalize(raw, type),
    genres: raw.genres ?? [],
    runtime: raw.runtime,
    seasons: raw.seasons?.filter((s: Season) => s.season_number > 0 && s.episode_count > 0),
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
  note: string
  url: (type: MediaType, id: string, season: number, episode: number) => string
}

// Embed players. Third-party players refuse to run inside a sandboxed iframe, so pop-ups can't be
// blocked from our side — Videasy is the default because it doesn't open pop-ups at all.
export const SERVERS: Server[] = [
  {
    id: 'videasy',
    name: 'Videasy',
    note: 'No pop-ups',
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://player.videasy.net/movie/${id}?color=E11D48`
        : `https://player.videasy.net/tv/${id}/${s}/${e}?color=E11D48&nextEpisode=true`,
  },
  {
    id: 'vidsrc',
    name: 'VidSrc',
    note: 'Backup · may show pop-ups',
    url: (type, id, s, e) =>
      type === 'movie'
        ? `${VIDSRC_BASE}/embed/movie?tmdb=${id}`
        : `${VIDSRC_BASE}/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
]
