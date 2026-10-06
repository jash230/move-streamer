// Shapes returned by /api/admin (see api/admin.ts). Timestamps arrive as ISO strings.

export interface Stats {
  visitors: number
  visits: number
  pageviews: number
  bounceRate: number
  typicalSeconds: number
  plays: number
}

export interface Point {
  t: string
  visitors: number
  pageviews: number
  plays: number
}

export interface Row {
  label: string | null
  visitors: number
  visits: number
}

export interface CityRow extends Row {
  country: string | null
}

export interface Review {
  id: string
  at: string
  rating: number
  comment: string
  name: string
  page: string
}

export interface LivePerson {
  country: string | null
  city: string | null
  device: string | null
  type: string | null
  path: string | null
  title: string | null
}

export interface Live {
  total: number
  watching: number
  people: LivePerson[]
}

export interface Overview {
  current: Stats
  previous: Stats | null
  unit: 'hour' | 'day'
  series: Point[]
  countries: Row[]
  cities: CityRow[]
  reviews: Review[]
  source: 'vercel' | 'cucuflix'
  sourceNote?: string
  coveredDays?: number | null
}

export interface Audience {
  countries: Row[]
  cities: CityRow[]
  devices: Row[]
  browsers: Row[]
  systems: Row[]
  sources: Row[]
  campaigns: { source: string | null; campaign: string | null; visitors: number }[]
  split: { new: number; returning: number }
  retention: { cohort: number; day1: number; day7: number; day30: number }
  source: 'vercel' | 'cucuflix'
}

export interface TitleRow {
  id: string
  type: 'movie' | 'tv'
  title: string | null
  plays: number
  finishes: number
  viewers: number
}

export interface Watching {
  funnel: { visits: number; opened: number; played: number; finished: number }
  titles: TitleRow[]
  opened: { id: string; type: 'movie' | 'tv'; title: string | null; visitors: number }[]
  searches: { query: string; searches: number; results: number | null }[]
  empty: { query: string; searches: number }[]
}

export interface Playback {
  servers: { server: string; plays: number; finishes: number; switches: number; try_next: number }[]
}

export interface Visit {
  id: string
  started_at: string
  last_seen: string
  pageviews: number
  entry_path: string
  country: string | null
  city: string | null
  device: string | null
  browser: string | null
  os: string | null
  referrer: string | null
  utm_source: string | null
  bounced: boolean
  returning: boolean
}

export interface Journey {
  visit: Visit & {
    visitor_id: string
    region: string | null
    utm_medium: string | null
    utm_campaign: string | null
    visits_by_visitor: number
  }
  steps: { at: string; type: string; path: string; props: Record<string, string | number | boolean> }[]
}

export interface Reviews {
  summary: { total: number; average: number }
  stars: { rating: number; n: number }[]
  reviews: Review[]
}
