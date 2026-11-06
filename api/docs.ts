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

export function GET(request: Request) {
  return Response.json(spec(new URL(request.url).origin), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
