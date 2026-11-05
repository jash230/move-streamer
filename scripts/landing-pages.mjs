// Writes dist/movies.html and dist/tv.html: copies of the built index.html with their own
// title, description, canonical and fallback content, so crawlers that skip JS still see
// distinct /movies and /tv pages. vercel.json rewrites those routes to these files.
import { readFileSync, writeFileSync } from 'node:fs'

const SITE = 'https://cucuflix.online'
const html = readFileSync('dist/index.html', 'utf8')

const pages = [
  {
    file: 'movies.html',
    path: '/movies',
    title: 'Watch Movies Online Free · Cucuflix',
    description: 'Watch movies online for free on Cucuflix. Stream now playing, popular, top rated and upcoming movies, no download needed.',
    heading: 'Watch movies online for free',
    blurb: 'New releases, popular hits, all-time top rated films and what is coming soon.',
  },
  {
    file: 'tv.html',
    path: '/tv',
    title: 'Watch TV Shows Online Free · Cucuflix',
    description: 'Watch TV shows online for free on Cucuflix. Stream full seasons and episodes of popular, top rated and airing-today series.',
    heading: 'Watch TV shows online for free',
    blurb: 'Full seasons and episodes of series airing today, popular shows and top rated TV.',
  },
]

const swap = (src, pattern, value) => {
  if (!pattern.test(src)) throw new Error(`landing-pages: ${pattern} not found in dist/index.html`)
  return src.replace(pattern, value)
}

for (const p of pages) {
  let out = html
  out = swap(out, /<title data-static>[^<]*<\/title>/, `<title data-static>${p.title}</title>`)
  out = swap(out, /(<meta data-static name="description" content=")[^"]*/, `$1${p.description}`)
  out = swap(out, /(<link data-static rel="canonical" href=")[^"]*/, `$1${SITE}${p.path}`)
  out = swap(out, /(<meta property="og:url" content=")[^"]*/, `$1${SITE}${p.path}`)
  out = swap(out, /(<meta property="og:title" content=")[^"]*/, `$1${p.title}`)
  out = swap(out, /<h1>Cucuflix<\/h1>\s*<p>[^<]*<\/p>/, `<h1>${p.heading}</h1>\n        <p>${p.blurb}</p>`)
  writeFileSync(`dist/${p.file}`, out)
}
