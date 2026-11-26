import { describe, expect, it } from 'vitest'
import { pickTrailer } from './api'

const v = (key: string, type: string, official = false, site = 'YouTube') => ({ key, type, official, site })

describe('pickTrailer', () => {
  it('prefers an official trailer, then any trailer, then a teaser', () => {
    expect(pickTrailer([v('t', 'Teaser'), v('fan', 'Trailer'), v('off', 'Trailer', true)])).toBe('off')
    expect(pickTrailer([v('t', 'Teaser'), v('fan', 'Trailer')])).toBe('fan')
    expect(pickTrailer([v('clip', 'Clip'), v('t', 'Teaser')])).toBe('t')
  })

  it('ignores videos it cannot embed and copes with none', () => {
    expect(pickTrailer([v('vim', 'Trailer', true, 'Vimeo')])).toBeUndefined()
    expect(pickTrailer(undefined)).toBeUndefined()
  })
})
