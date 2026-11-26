// /sitemap.xml: the main pages plus every title in TMDB's trending, popular and top rated lists,
// so search engines can find /movie/:id and /tv/:id pages without running the app's JS.
import { tmdbFetch } from './_lib/tmdb.js'

const SITE = 'https://cucuflix.online'
const PAGES = ['/', '/movies', '/tv', '/docs']
const LISTS = [
  '/trending/movie/week', '/movie/popular', '/movie/top_rated', '/movie/now_playing',
  '/trending/tv/week', '/tv/popular', '/tv/top_rated', '/tv/on_the_air',
]
const DEPTH = 10 // pages of 20 per list: up to 1,600 titles before de-duplication

async function ids(list: string, page: number): Promise<string[]> {
  const res = await tmdbFetch(list, [['page', String(page)]])?.catch(() => undefined)
  if (!res?.ok) return []
  const type = list.includes('movie') ? 'movie' : 'tv'
  const { results = [] } = (await res.json()) as { results?: { id: number }[] }
  return results.map((r) => `/${type}/${r.id}`)
}

export function sitemapXml(paths: Iterable<string>) {
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${SITE}${p}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export async function GET() {
  const titles = await Promise.all(LISTS.flatMap((list) => Array.from({ length: DEPTH }, (_, i) => ids(list, i + 1))))
  return new Response(sitemapXml([...PAGES, ...titles.flat()]), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
