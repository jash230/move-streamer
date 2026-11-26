// Serves /movie/:id and /tv/:id: the built index.html with that title's metadata swapped in, so crawlers,
// AI fetchers and link previews that skip JS see the real title, canonical and Movie/TVSeries schema
// instead of the homepage's. The app still boots from the same HTML and takes over the tags (see Seo.tsx).
import { tmdbFetch } from './_lib/tmdb.js'

const SITE = 'https://cucuflix.online'
const IMG = 'https://image.tmdb.org/t/p/'

type Type = 'movie' | 'tv'
export type Details = {
  title?: string
  name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: { name: string }[]
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const attr = (html: string, pattern: RegExp, value: string) => html.replace(pattern, `$1${esc(value)}`)

export function titleHtml(html: string, type: Type, id: string, d: Details) {
  const name = (type === 'movie' ? d.title : d.name) || 'Untitled'
  const title = `${name} · Cucuflix`
  const description = d.overview ? d.overview.slice(0, 155) : `Watch ${name} online on Cucuflix.`
  const url = `${SITE}/${type}/${id}`
  const date = (type === 'movie' ? d.release_date : d.first_air_date) || undefined
  const image = d.backdrop_path ? `${IMG}w1280${d.backdrop_path}` : undefined

  const schema = {
    '@context': 'https://schema.org',
    '@type': type === 'movie' ? 'Movie' : 'TVSeries',
    name,
    url,
    description: d.overview || undefined,
    image: d.poster_path ? `${IMG}w500${d.poster_path}` : undefined,
    [type === 'movie' ? 'datePublished' : 'startDate']: date,
    genre: d.genres?.length ? d.genres.map((g) => g.name) : undefined,
  }
  // Escaping < keeps a title like "</script>" from closing the tag.
  const ld = `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`

  let out = html
    .replace(/<title data-static>[^<]*<\/title>/, `<title data-static>${esc(title)}</title>`)
    .replace(/<h1>Cucuflix<\/h1>\s*<p>[^<]*<\/p>/, `<h1>${esc(name)}</h1>\n        <p>${esc(description)}</p>`)
    .replace('</head>', `  ${ld}\n  </head>`)
  out = attr(out, /(<meta data-static name="description" content=")[^"]*/, description)
  out = attr(out, /(<link data-static rel="canonical" href=")[^"]*/, url)
  out = attr(out, /(<meta property="og:type" content=")[^"]*/, type === 'movie' ? 'video.movie' : 'video.tv_show')
  out = attr(out, /(<meta property="og:url" content=")[^"]*/, url)
  out = attr(out, /(<meta property="og:title" content=")[^"]*/, title)
  out = attr(out, /(<meta property="og:description" content=")[^"]*/, description)
  out = attr(out, /(<meta name="twitter:title" content=")[^"]*/, title)
  out = attr(out, /(<meta name="twitter:description" content=")[^"]*/, description)
  if (image) {
    out = attr(out, /(<meta property="og:image" content=")[^"]*/, image)
    out = attr(out, /(<meta name="twitter:image" content=")[^"]*/, image)
    out = attr(out, /(<meta property="og:image:width" content=")[^"]*/, '1280')
    out = attr(out, /(<meta property="og:image:height" content=")[^"]*/, '720')
    out = attr(out, /(<meta property="og:image:alt" content=")[^"]*/, name)
  }
  return out
}

export async function GET(request: Request) {
  const incoming = new URL(request.url)
  const type = incoming.searchParams.get('type')
  const id = incoming.searchParams.get('id') ?? ''
  if ((type !== 'movie' && type !== 'tv') || !/^\d+$/.test(id)) return new Response('Not found', { status: 404 })

  const [page, details] = await Promise.all([
    // Forward the auth cookie and bypass header so protected preview deployments can still read their own index.html.
    fetch(new URL('/index.html', incoming.origin), {
      headers: Object.fromEntries(['cookie', 'x-vercel-protection-bypass'].flatMap((h) => {
        const v = request.headers.get(h)
        return v ? [[h, v]] : []
      })),
    }),
    tmdbFetch(`/${type}/${id}`)?.catch(() => undefined),
  ])
  if (!page.ok) return page

  const html = await page.text()
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  // TMDB down or no key: serve the plain app shell so the page still works.
  if (!details?.ok) return new Response(html, { status: details?.status === 404 ? 404 : 200, headers })

  return new Response(titleHtml(html, type, id, await details.json()), {
    headers: { ...headers, 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  })
}
