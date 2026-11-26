// Server-side TMDB proxy so the API key never ships to the browser in production.
// Called as /api/tmdb?path=/movie/550&language=en-US — `path` is the TMDB v3 path, other params pass through.
import { tmdbFetch } from './_lib/tmdb.js'

const PATH = /^\/[a-z0-9_/-]+$/i

export async function GET(request: Request) {
  const incoming = new URL(request.url)
  const path = incoming.searchParams.get('path') ?? ''
  if (!PATH.test(path) || path.includes('..')) {
    return Response.json({ status_message: 'Invalid path' }, { status: 400 })
  }

  const pending = tmdbFetch(path, [...incoming.searchParams].filter(([k]) => k !== 'path'))
  if (!pending) return Response.json({ status_message: 'TMDB_API_KEY is not set' }, { status: 500 })
  const res = await pending
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      // Catalog data changes slowly; let the deployment CDN absorb repeat requests.
      'Cache-Control': res.ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store',
    },
  })
}
