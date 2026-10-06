import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Runs the Vercel functions in api/*.ts inside `npm run dev`, so /api works locally the way it does
// on Vercel. Server-only variables from .env.local are exposed to them through process.env.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(env)) process.env[k] ??= v

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const match = /^\/api\/([a-z]+)(?:[?/]|$)/.exec(req.url ?? '')
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = mod[req.method ?? 'GET']
          if (typeof handler !== 'function') {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const body = chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : undefined
          const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body })
          const response: Response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          server.config.logger.error(`[api] ${req.url}: ${(e as Error).stack ?? e}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
  // NEXT_PUBLIC_ lets the Clerk publishable key keep the name Clerk and Vercel give it.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
