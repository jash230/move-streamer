// Turns an /api/admin response into report data, or a readable error. A 200 that isn't JSON means
// the request never reached the API (for example a dev server without the API running).
export async function readReport<T>(res: Response): Promise<T> {
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
  if (!isJson) {
    throw new Error(res.ok
      ? "The data service didn't answer. Run the dashboard with `npm run dev` from this project, or open it on the Vercel site."
      : `The server answered ${res.status}`)
  }
  const body = (await res.json()) as { data?: T; error?: string }
  if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}`)
  if (body.data === undefined) throw new Error('The server sent no data for this report')
  return body.data
}
