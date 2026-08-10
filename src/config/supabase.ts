import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

const authOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
} as const

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  authOptions,
)

// Use a fresh auth client per operation so concurrent server requests never
// share mutable client-side session state.
export function createSupabaseAuthClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, authOptions)
}
