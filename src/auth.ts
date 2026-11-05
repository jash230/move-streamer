import type { Session } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { refresh, supabaseRemote, switchAccount, type Sync } from './sync'

// Viewer sign-in (Supabase Auth, email + password) and the account sync it drives.

// undefined while the saved session is still being read.
let session: Session | null | undefined = supabase ? undefined : null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSession = () => useSyncExternalStore(subscribe, () => session, () => undefined)

// ---------- Account dialog (one instance, opened from anywhere) ----------

export type AccountMode = 'sign-in' | 'sign-up' | 'forgot' | 'new-password'
let dialog: AccountMode | null = null
const dialogListeners = new Set<() => void>()
const setDialog = (mode: AccountMode | null) => {
  dialog = mode
  dialogListeners.forEach((l) => l())
}
export const openAccount = (mode: AccountMode = 'sign-in') => setDialog(mode)
export const closeAccount = () => setDialog(null)
export const useAccountDialog = () => useSyncExternalStore(
  (l) => {
    dialogListeners.add(l)
    return () => dialogListeners.delete(l)
  },
  () => dialog,
  () => null,
)

// ---------- Sync lifecycle ----------

let sync: Sync | null = null
let syncedUser: string | null = null
// Account switches run one at a time, in order.
let switching: Promise<unknown> = Promise.resolve()

function follow(userId: string | null) {
  switching = switching.then(async () => {
    if (userId === syncedUser) return
    syncedUser = userId
    sync = await switchAccount(supabaseRemote(supabase!), sync, userId)
  })
}

export function initAccounts() {
  if (!supabase) return
  supabase.auth.onAuthStateChange((event, next) => {
    session = next
    emit()
    if (event === 'PASSWORD_RECOVERY') openAccount('new-password')
    // Supabase asks not to await its own calls inside this callback.
    setTimeout(() => follow(next?.user.id ?? null), 0)
  })

  // Another device may have moved on: pull its changes when this tab comes back, and send ours
  // when it's hidden or closed.
  document.addEventListener('visibilitychange', () => {
    if (!sync || !syncedUser) return
    if (document.visibilityState === 'hidden') void sync.flush().catch(() => {})
    else void refresh(sync, syncedUser).catch(() => {})
  })
  window.addEventListener('pagehide', () => void sync?.flush().catch(() => {}))
}

// ---------- Actions ----------

const client = () => {
  if (!supabase) throw new Error('Accounts are not set up on this site yet')
  return supabase
}

export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email, password })
  if (error) throw error
}

// Resolves to true when the account is ready, false when it waits on the confirmation email.
export async function signUp(email: string, password: string) {
  const { data, error } = await client().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
  if (error) throw error
  // Supabase answers an already-registered email with a user that has no identities.
  if (data.user && data.user.identities?.length === 0) throw new Error('That email already has an account. Sign in instead.')
  return Boolean(data.session)
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
  if (error) throw error
}

export async function setNewPassword(password: string) {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  // Save the last pause point before the session (and the right to write) goes away.
  await sync?.flush().catch(() => {})
  const { error } = await client().auth.signOut()
  if (error) throw error
}
