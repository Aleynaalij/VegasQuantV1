import { createClient } from "@supabase/supabase-js";
// Publishable credentials are intentionally public. RLS and admin RPC authorization protect writes.
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uowearboulykfcwnuirn.supabase.co";
export const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_O6zAOHpbYpSg4UF3qJkZvA_2QqzIuvP";
export const supabase = createClient(supabaseUrl, publishableKey);
