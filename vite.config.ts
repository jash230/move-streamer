import react from '@vitejs/plugin-react'
import { createDecipheriv } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VIDROCK_KEY_HEX } from './src/vidrockKey.js'

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
        // Mirrors the /docs rewrite in vercel.json.
        if (/^\/docs\/?(?:\?|$)/.test(req.url ?? '')) req.url = '/api/docs?format=html'
        if ((req.url ?? '').split('?')[0] === '/api/dev/vidrock-decrypt') {
          if (req.method !== 'POST') {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          try {
            const bytes = Buffer.from(Buffer.concat(chunks).toString('utf8').trim(), 'base64url')
            if (bytes.length < 28) throw new Error('bad token')
            const decipher = createDecipheriv('aes-256-gcm', Buffer.from(VIDROCK_KEY_HEX, 'hex'), bytes.subarray(0, 12))
            decipher.setAuthTag(bytes.subarray(-16))
            const plain = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()])
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            return res.end(plain)
          } catch {
            res.statusCode = 400
            return res.end('bad token')
          }
        }
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
