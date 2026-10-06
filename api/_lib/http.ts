const NO_STORE = { 'Cache-Control': 'no-store' }

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })
export const error = (message: string, status: number) => json({ error: message }, status)
