import { describe, expect, it } from 'vitest'
import { readReport } from './readReport'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('readReport', () => {
  it('returns the data of a JSON report', async () => {
    expect(await readReport(json({ data: { total: 3 } }))).toEqual({ total: 3 })
  })

  it('surfaces the server error message', async () => {
    await expect(readReport(json({ error: 'Sign in to continue' }, 401))).rejects.toThrow('Sign in to continue')
  })

  it('fails loudly when a 200 is not a JSON report (e.g. a dev server serving source files)', async () => {
    const res = new Response('export async function GET() {}', { status: 200, headers: { 'Content-Type': 'text/javascript' } })
    await expect(readReport(res)).rejects.toThrow(/data service/i)
  })

  it('fails when JSON has no data', async () => {
    await expect(readReport(json({}))).rejects.toThrow(/no data/i)
  })
})
