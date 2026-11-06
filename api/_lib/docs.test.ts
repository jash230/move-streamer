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

describe('readable docs', () => {
  it('renders every endpoint as HTML and escapes spec text', async () => {
    const res = GET(new Request('https://cucuflix.online/api/docs?format=html'))
    expect(res.headers.get('content-type')).toContain('text/html')
    const page = await res.text()
    expect(page).toContain('<code>/api/tmdb</code>')
    expect(page).toContain('<code>/api/reviews</code>')
    expect(page).toContain('href="https://cucuflix.online/api/tmdb?path=%2Fmovie%2F550"')
    expect(page).not.toMatch(/<script/i)
  })
})
