import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

// The publishable key is public by design; every table is protected by row-level security.
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  // PKCE returns the OAuth result as ?code=…, keeping the #/route part of the URL for the app's own routing.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
