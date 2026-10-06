// Admin endpoints accept a Clerk session token (Authorization: Bearer) and only for user IDs
// listed in ADMIN_USER_IDS. Public sign-up is disabled in the Clerk dashboard as a second lock.
import { createClerkClient } from '@clerk/backend'
import { error } from './http.js'

let clerk: ReturnType<typeof createClerkClient> | null = null

export async function requireAdmin(request: Request): Promise<Response | null> {
  const secretKey = process.env.CLERK_SECRET_KEY
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!secretKey || !publishableKey) return error('Clerk keys are not set on the server', 503)
  clerk ??= createClerkClient({ secretKey, publishableKey })

  const state = await clerk.authenticateRequest(request, { authorizedParties: [new URL(request.url).origin] })
  if (!state.isAuthenticated) return error('Sign in to continue', 401)

  const userId = state.toAuth().userId
  const admins = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!admins.includes(userId)) {
    return error(`This account isn't an admin. Add ${userId} to ADMIN_USER_IDS in Vercel, then redeploy.`, 403)
  }
  return null
}
