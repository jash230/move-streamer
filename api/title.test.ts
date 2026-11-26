import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { titleHtml } from './title.js'
import { GET as sitemap, sitemapXml } from './sitemap.js'

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('title page html', () => {
  const out = titleHtml(shell, 'movie', '550', {
    title: 'Fight Club',
    overview: 'An insomniac & a soap salesman.',
    release_date: '1999-10-15',
    poster_path: '/p.jpg',
    backdrop_path: '/b.jpg',
    genres: [{ name: 'Drama' }],
  })

  it('swaps every crawler-facing tag to the title', () => {
    expect(out).toContain('<title data-static>Fight Club · Cucuflix</title>')
    expect(out).toContain('<link data-static rel="canonical" href="https://cucuflix.online/movie/550"')
    expect(out).toContain('content="An insomniac &#38; a soap salesman."')
    expect(out).toContain('<meta property="og:url" content="https://cucuflix.online/movie/550"')
    expect(out).toContain('<meta property="og:type" content="video.movie"')
    expect(out).toContain('<meta property="og:image" content="https://image.tmdb.org/t/p/w1280/b.jpg"')
    expect(out).toContain('<meta name="twitter:title" content="Fight Club · Cucuflix"')
    expect(out).toContain('<h1>Fight Club</h1>')
    expect(out).not.toContain('href="https://cucuflix.online/" />')
  })

  it('adds Movie schema that cannot break out of its script tag', () => {
    const ld = titleHtml(shell, 'tv', '1', { name: '</script><b>', first_air_date: '2011-04-17' })
    const block = ld.match(/<script type="application\/ld\+json">(\{"@context[^<]*)<\/script>/)![1]
    expect(JSON.parse(block)).toMatchObject({ '@type': 'TVSeries', name: '</script><b>', startDate: '2011-04-17' })
    expect(JSON.parse(out.match(/<script type="application\/ld\+json">(\{"@context[^<]*)<\/script>/)![1]))
      .toMatchObject({ '@type': 'Movie', datePublished: '1999-10-15', genre: ['Drama'] })
  })
})

describe('sitemap', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('de-duplicates paths', () => {
    expect(sitemapXml(['/', '/movie/1', '/movie/1']).match(/<loc>/g)).toHaveLength(2)
  })

  it('lists titles from TMDB and still serves the main pages when TMDB fails', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn(async (url: URL) =>
      url.pathname.includes('top_rated') ? new Response('', { status: 500 }) : Response.json({ results: [{ id: 7 }] })))
    const xml = await (await sitemap()).text()
    expect(xml).toContain('<loc>https://cucuflix.online/movie/7</loc>')
    expect(xml).toContain('<loc>https://cucuflix.online/tv/7</loc>')
    expect(xml).toContain('<loc>https://cucuflix.online/movies</loc>')
    vi.unstubAllEnvs()
  })
})
