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
  imdb_id?: string
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
  note: string
  popups: boolean
  // Torrent servers play in our own <video> instead of a third-party iframe, so they carry no ads.
  torrent?: boolean
  url: (type: MediaType, id: string, season: number, episode: number) => string
}

// Embed players. Third-party players refuse to run inside a sandboxed iframe, so pop-ups can't be
// blocked from our side — Videasy is the default because it doesn't open pop-ups at all.
export const SERVERS: Server[] = [
  {
    id: 'videasy',
    name: 'Videasy',
    note: 'Recommended',
    popups: false,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://player.videasy.net/movie/${id}?color=E11D48`
        : `https://player.videasy.net/tv/${id}/${s}/${e}?color=E11D48&nextEpisode=true`,
  },
  {
    id: 'vidsrc',
    name: 'VidSrc',
    note: 'Backup',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `${VIDSRC_BASE}/embed/movie?tmdb=${id}`
        : `${VIDSRC_BASE}/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    note: 'Quick to start',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://vidlink.pro/movie/${id}?primaryColor=E11D48`
        : `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E11D48&nextbutton=true`,
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    note: 'Choose your quality',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://vidfast.pro/movie/${id}?theme=E11D48`
        : `https://vidfast.pro/tv/${id}/${s}/${e}?theme=E11D48&nextButton=true`,
  },
  {
    id: 'vidsrcto',
    name: 'VidSrc.to',
    note: 'Backup',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie' ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'superembed',
    name: 'SuperEmbed',
    note: 'Biggest library',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie'
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    id: '2embed',
    name: '2Embed',
    note: 'Backup',
    popups: true,
    url: (type, id, s, e) =>
      type === 'movie' ? `https://www.2embed.cc/embed/${id}` : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: 'torrentio',
    name: 'Torrentio',
    note: 'Torrents via Stremio',
    popups: false,
    torrent: true,
    url: () => '',
  },
]

// Torrentio lists torrents; Stremio's local streaming server turns them into HTTP video we can play.
const TORRENTIO_BASE = 'https://torrentio.strem.fun'
const TORRENTIO_CONFIG = ((import.meta.env.VITE_TORRENTIO_CONFIG as string | undefined) ?? 'qualityfilter=scr,cam').replace(/^\/|\/$/g, '')
export const STREMIO_SERVER = ((import.meta.env.VITE_STREMIO_SERVER as string | undefined) ?? 'http://127.0.0.1:11470').replace(/\/$/, '')

export interface TorrentStream {
  key: string
  quality: string
  title: string
  file?: string
  seeders?: number
  size?: string
  source?: string
  url: string
  // Name hints that the browser can't decode it natively (HEVC, AC3/DTS audio, MKV…).
  needsTranscode: boolean
}

const TRANSCODE_HINT = /x265|hevc|h\.?265|av1|10.?bit|\b(e?ac3|ddp?|dd\+?\d|dts|truehd|atmos|flac)\b|\.(mkv|avi)\b/i

export async function getTorrentStreams(imdbId: string, type: MediaType, season: number, episode: number): Promise<TorrentStream[]> {
  const target = type === 'movie' ? `movie/${imdbId}` : `series/${imdbId}:${season}:${episode}`
  const config = TORRENTIO_CONFIG ? `${TORRENTIO_CONFIG}/` : ''
  const res = await fetch(`${TORRENTIO_BASE}/${config}stream/${target}.json`)
  if (!res.ok) throw new Error(`Torrentio ${res.status}: ${res.statusText}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { streams = [] } = (await res.json()) as { streams: any[] }
  return streams
    .filter((st) => st.url || st.infoHash)
    .map((st, i) => {
      const lines: string[] = String(st.title ?? '').split('\n')
      const stats = lines.find((l) => l.includes('💾')) ?? ''
      const file: string | undefined = st.behaviorHints?.filename ?? (lines[1] && lines[1] !== stats ? lines[1] : undefined)
      return {
        key: `${st.infoHash ?? st.url}-${st.fileIdx ?? i}`,
        quality: String(st.name ?? '').split('\n').slice(1).join(' ') || 'Unknown',
        title: lines[0],
        file,
        seeders: Number(stats.match(/👤 (\d+)/)?.[1]) || undefined,
        size: stats.match(/💾 ([\d.]+ [KMGT]B)/)?.[1],
        source: stats.match(/⚙️ (.+)$/)?.[1]?.trim(),
        url: st.url ?? `${STREMIO_SERVER}/${st.infoHash}/${st.fileIdx ?? -1}`,
        needsTranscode: TRANSCODE_HINT.test(`${lines[0]} ${file ?? ''}`),
      }
    })
}

// Best default: a browser-friendly 1080p (or 720p) with the most seeders, else whatever ranks first.
export function pickDefaultStream(streams: TorrentStream[]) {
  for (const q of ['1080p', '720p']) {
    const list = streams.filter((s) => s.quality.startsWith(q)).sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0))
    const best = list.find((s) => !s.needsTranscode) ?? list[0]
    if (best) return best
  }
  return streams[0]
}

export async function stremioServerUp() {
  try {
    const res = await fetch(`${STREMIO_SERVER}/settings`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

// Stremio's server remuxes/transcodes to HLS, keeping any codec the browser can already decode.
export function transcodeUrl(mediaUrl: string) {
  const ms = typeof MediaSource !== 'undefined' ? MediaSource : undefined
  const params = new URLSearchParams({ mediaURL: mediaUrl, maxAudioChannels: '2' })
  params.append('videoCodecs', 'h264')
  if (ms?.isTypeSupported('video/mp4; codecs="hvc1.1.6.L150.B0"')) params.append('videoCodecs', 'h265')
  for (const a of ['aac', 'mp3']) params.append('audioCodecs', a)
  if (ms?.isTypeSupported('audio/mp4; codecs="opus"')) params.append('audioCodecs', 'opus')
  return `${STREMIO_SERVER}/hlsv2/${crypto.randomUUID()}/master.m3u8?${params}`
}

export async function torrentPeers(mediaUrl: string) {
  const m = mediaUrl.match(/^(.*\/[0-9a-f]{40})\/-?\d+$/i)
  if (!m) return undefined
  try {
    const res = await fetch(`${m[1]}/stats.json`)
    return ((await res.json()) as { peers?: number }).peers
  } catch {
    return undefined
  }
}

// Embed players report playback through postMessage, each in its own shape (VidLink/VidFast send
// { type: 'PLAYER_EVENT', data: { event, currentTime, duration } }, Videasy sends JSON progress strings).
export function isEndedMessage(raw: unknown) {
  let d = raw
  if (typeof d === 'string') {
    try { d = JSON.parse(d) } catch { return false }
  }
  if (!d || typeof d !== 'object') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = d as any
  const event = m.data?.event ?? m.event
  if (event === 'ended' || event === 'complete') return true
  const current = m.data?.currentTime ?? m.currentTime ?? m.timestamp
  const duration = m.data?.duration ?? m.duration
  return typeof current === 'number' && typeof duration === 'number' && duration > 60 && duration - current < 1.5
}

const baseDomain = (host: string) => host.split('.').slice(-2).join('.')
export const sameSite = (origin: string, url: string) => {
  try {
    return baseDomain(new URL(origin).hostname) === baseDomain(new URL(url).hostname)
  } catch {
    return false
  }
}
