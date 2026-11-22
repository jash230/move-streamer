type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD'
type ApiHandler = (request: Request) => Response | Promise<Response>
type ApiModule = Partial<Record<Method, ApiHandler>>

interface NetlifyGeo {
  city?: string
  country?: { code?: string }
  subdivision?: { code?: string }
}

interface NetlifyContext {
  geo?: NetlifyGeo
}

// Adapt the existing Web Request/Response API handlers to Netlify Functions and pass Netlify's
// request geolocation through neutral headers so the tracker works on any hosting provider.
export function netlifyFunction(api: ApiModule) {
  return async (request: Request, context: NetlifyContext = {}): Promise<Response> => {
    const headers = new Headers(request.headers)
    headers.delete('x-site-country')
    headers.delete('x-site-region')
    headers.delete('x-site-city')
    if (context.geo?.country?.code) headers.set('x-site-country', context.geo.country.code)
    if (context.geo?.subdivision?.code) headers.set('x-site-region', context.geo.subdivision.code)
    if (context.geo?.city) headers.set('x-site-city', context.geo.city)

    const handler = api[request.method as Method]
    if (!handler) {
      const allowed = (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const)
        .filter((method) => typeof api[method] === 'function')
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: allowed.join(', ') },
      })
    }
    return handler(new Request(request, { headers }))
  }
}
