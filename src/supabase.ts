import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Viewer accounts. Without these two keys the site runs exactly as before: everything stays in this
// browser and the sign-in button is hidden.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

export const hasAccounts = supabase !== null
