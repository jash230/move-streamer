// Machine-readable description of the site's public API (OpenAPI 3.1), so agents and LLM tools can
// discover what Cucuflix offers. Linked from llms.txt, robots.txt and a rel=service-desc tag in index.html.
// Internal endpoints (admin, cron, analytics) are left out on purpose.
const SITE = 'https://cucuflix.online'

export function spec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Cucuflix API',
      version: '1.0.0',
      summary: 'Public API behind cucuflix.online, a free site to watch movies and TV shows online.',
      description: [
        'Cucuflix streams movies, TV shows and Israeli TV in the browser with no sign-up.',
        'Every title has a page at `/movie/{tmdb_id}` or `/tv/{tmdb_id}`, keyed by its TMDB ID.',
        `A plain-language overview of the site is at ${SITE}/llms.txt.`,
      ].join(' '),
    },
    externalDocs: { description: 'LLM-friendly site summary', url: `${SITE}/llms.txt` },
    servers: [{ url: origin }],
    paths: {
      '/api/tmdb': {
        get: {
          operationId: 'tmdb',
          summary: 'Read movie and TV catalog data',
          description:
            'Read-only proxy to The Movie Database (TMDB) v3 API. `path` is any TMDB v3 path; every other query ' +
            'parameter is passed through. Use it to look up titles, then link to `/movie/{id}` or `/tv/{id}` to watch them. ' +
            'See https://developer.themoviedb.org/reference for the paths and response shapes.',
          parameters: [
            {
              name: 'path',
              in: 'query',
              required: true,
              description: 'TMDB v3 path, starting with a slash.',
              schema: { type: 'string', pattern: '^/[A-Za-z0-9_/-]+$' },
              examples: {
                movie: { summary: 'Movie details', value: '/movie/550' },
                search: { summary: 'Search movies and shows', value: '/search/multi' },
                trending: { summary: 'Trending this week', value: '/trending/all/week' },
                season: { summary: 'TV season episodes', value: '/tv/1399/season/1' },
              },
            },
            { name: 'query', in: 'query', description: 'Search text, for `/search/*` paths.', schema: { type: 'string' } },
            { name: 'language', in: 'query', description: 'Response language, e.g. `en-US` or `he-IL`.', schema: { type: 'string' } },
            { name: 'page', in: 'query', description: 'Results page for list endpoints.', schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            '200': { description: 'The TMDB response, unchanged.', content: { 'application/json': { schema: { type: 'object' } } } },
            '400': { description: 'Invalid `path`.', content: { 'application/json': { schema: { $ref: '#/components/schemas/TmdbError' } } } },
          },
        },
      },
      '/api/reviews': {
        post: {
          operationId: 'createReview',
          summary: 'Leave a review of the site',
          description: 'Submits a star rating and optional comment. Limited to 5 reviews per hour per visitor.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rating'],
                  properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 5 },
                    comment: { type: 'string', maxLength: 1000 },
                    name: { type: 'string', maxLength: 60 },
                    page: { type: 'string', maxLength: 200, description: 'Page the review was left from.' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Saved.', content: { 'application/json': { schema: { type: 'object', properties: { ok: { const: true } } } } } },
            '400': { description: 'Invalid input.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { description: 'Too many reviews.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' } } },
        TmdbError: { type: 'object', properties: { status_message: { type: 'string' } } },
      },
    },
  }
}

type Schema = { type?: string; minimum?: number; maximum?: number; maxLength?: number; pattern?: string; description?: string }
type Param = { name: string; required?: boolean; description?: string; schema: Schema; examples?: Record<string, { summary: string; value: string }> }
type Operation = {
  summary: string
  description: string
  parameters?: Param[]
  requestBody?: { content: Record<string, { schema: { required?: string[]; properties: Record<string, Schema> } }> }
  responses: Record<string, { description: string }>
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
// Just enough markdown for the descriptions: `code` and bare URLs.
const md = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/https:\/\/[^\s<]+[^\s<.,)]/g, (u) => `<a href="${u}">${u}</a>`)

const limits = (s: Schema) =>
  [s.type, s.minimum !== undefined && `≥ ${s.minimum}`, s.maximum !== undefined && `≤ ${s.maximum}`, s.maxLength && `max ${s.maxLength} chars`]
    .filter(Boolean)
    .join(', ')

const row = (name: string, required: boolean, s: Schema, description = s.description ?? '') =>
  `<tr><td><code>${esc(name)}</code>${required ? ' <span class="req">required</span>' : ''}</td><td>${esc(limits(s))}</td><td>${md(description)}</td></tr>`

const table = (rows: string[]) =>
  `<table><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows.join('')}</tbody></table>`

function operation(path: string, method: string, op: Operation, origin: string) {
  const params = op.parameters ?? []
  const body = op.requestBody?.content['application/json']?.schema
  const examples = params.flatMap((p) =>
    Object.values(p.examples ?? {}).map((e) => {
      const url = `${origin}${path}?${p.name}=${encodeURIComponent(e.value)}`
      return `<li>${esc(e.summary)}: <a href="${esc(url)}"><code>${esc(`${path}?${p.name}=${e.value}`)}</code></a></li>`
    }),
  )
  return `<section id="${esc(path.slice(1).replace(/\//g, '-'))}">
<h2><span class="method ${method}">${method.toUpperCase()}</span> <code>${esc(path)}</code></h2>
<p class="summary">${esc(op.summary)}</p>
<p>${md(op.description)}</p>
${params.length ? `<h3>Query parameters</h3>${table(params.map((p) => row(p.name, !!p.required, p.schema, p.description)))}` : ''}
${examples.length ? `<h3>Examples</h3><ul>${examples.join('')}</ul>` : ''}
${body ? `<h3>JSON body</h3>${table(Object.entries(body.properties).map(([k, s]) => row(k, !!body.required?.includes(k), s)))}` : ''}
<h3>Responses</h3><ul>${Object.entries(op.responses).map(([code, r]) => `<li><code>${code}</code> ${esc(r.description)}</li>`).join('')}</ul>
</section>`
}

export function html(origin: string) {
  const s = spec(origin)
  const ops = Object.entries(s.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => operation(path, method, op as Operation, origin)),
  )
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cucuflix API docs</title>
<meta name="description" content="${esc(s.info.summary)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="service-desc" type="application/openapi+json" href="/api/docs" />
<link rel="alternate" type="text/markdown" title="LLM summary" href="/llms.txt" />
<style>
:root { --bg: #fff; --fg: #141414; --muted: #5c5c5c; --line: #e4e4e4; --code: #f3f3f3; --accent: #e50914; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #ececec; --muted: #a0a0a0; --line: #2a2a2a; --code: #1d1d1d; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 40px 16px 64px; }
h1 { margin: 0 0 8px; font-size: 2rem; } h1 span { color: var(--accent); }
h2 { margin: 0 0 4px; font-size: 1.25rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 24px 0 8px; }
section { border-top: 1px solid var(--line); padding: 32px 0 8px; margin-top: 32px; }
a { color: inherit; text-underline-offset: 3px; }
code { background: var(--code); padding: 1px 6px; border-radius: 4px; font: .88em ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.lead { color: var(--muted); } .summary { font-weight: 600; margin: 0; }
.method { font: 700 .75rem ui-monospace, monospace; padding: 3px 8px; border-radius: 4px; color: #fff; }
.get { background: #1f7a4d; } .post { background: #2457c5; }
.req { font-size: .72rem; color: var(--accent); }
.links { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 0; list-style: none; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { text-align: left; padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); }
</style>
</head>
<body>
<main>
<h1><span>Cucuflix</span> API</h1>
<p class="lead">${md(s.info.description)}</p>
<ul class="links">
<li><a href="/api/docs">OpenAPI 3.1 spec (JSON)</a></li>
<li><a href="/llms.txt">llms.txt</a></li>
<li><a href="/">Back to Cucuflix</a></li>
</ul>
<p>Base URL: <code>${esc(origin)}</code>. No API key is needed.</p>
${ops.join('\n').replace(/<table>/g, '<div class="scroll"><table>').replace(/<\/table>/g, '</table></div>')}
</main>
</body>
</html>`
}

const CACHE = 'public, s-maxage=86400, stale-while-revalidate=604800'

// /api/docs is the JSON spec; /docs is rewritten here with ?format=html for people.
export function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  if (url.searchParams.get('format') === 'html') {
    return new Response(html(origin), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': CACHE } })
  }
  return Response.json(spec(origin), { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': CACHE } })
}
