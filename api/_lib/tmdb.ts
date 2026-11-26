// Authenticated TMDB v3 request. Returns null when TMDB_API_KEY is not set.
export function tmdbFetch(path: string, params: Iterable<[string, string]> = []): Promise<Response> | null {
  const key = process.env.TMDB_API_KEY
  if (!key) return null
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [k, v] of params) url.searchParams.set(k, v)
  const headers: HeadersInit = {}
  // Long keys are v4 read-access tokens; short ones are v3 api keys.
  if (key.length > 40) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)
  return fetch(url, { headers })
}
