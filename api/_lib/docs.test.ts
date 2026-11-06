import { describe, expect, it } from 'vitest'
import { GET, spec } from '../docs.js'

describe('api docs', () => {
  it('documents only the public endpoints, served from the request origin', async () => {
    const res = GET(new Request('https://preview.example/api/docs'))
    const body = await res.json()
    expect(body.openapi).toBe('3.1.0')
    expect(body.servers).toEqual([{ url: 'https://preview.example' }])
    expect(Object.keys(body.paths).sort()).toEqual(['/api/reviews', '/api/tmdb'])
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('keeps the review limits in step with the handler', () => {
    const props = spec('x').paths['/api/reviews'].post.requestBody.content['application/json'].schema.properties
    expect(props.comment.maxLength).toBe(1000)
    expect(props.name.maxLength).toBe(60)
  })
})
