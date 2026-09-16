import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabasePublicKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // Placeholder client so imports never throw before the config screen can render.
    return createClient('https://unavailable.supabase.co', 'public-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = createSupabaseClient();
