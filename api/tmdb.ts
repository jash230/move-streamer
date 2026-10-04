// Server-side TMDB proxy so the API key never ships to the browser in production.
// Called as /api/tmdb?path=/movie/550&language=en-US — `path` is the TMDB v3 path, other params pass through.
const PATH = /^\/[a-z0-9_/-]+$/i

export async function GET(request: Request) {
  const key = process.env.TMDB_API_KEY
  if (!key) return Response.json({ status_message: 'TMDB_API_KEY is not set' }, { status: 500 })

  const incoming = new URL(request.url)
  const path = incoming.searchParams.get('path') ?? ''
  if (!PATH.test(path) || path.includes('..')) {
    return Response.json({ status_message: 'Invalid path' }, { status: 400 })
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [k, v] of incoming.searchParams) if (k !== 'path') url.searchParams.set(k, v)
  const headers: HeadersInit = {}
  // Long keys are v4 read-access tokens; short ones are v3 api keys.
  if (key.length > 40) headers.Authorization = `Bearer ${key}`
  else url.searchParams.set('api_key', key)

  const res = await fetch(url, { headers })
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      // Catalog data changes slowly; let Vercel's CDN absorb repeat requests.
      'Cache-Control': res.ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store',
    },
  })
}
