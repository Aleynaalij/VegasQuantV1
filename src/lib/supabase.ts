import { createClient } from "@supabase/supabase-js";
import { STAGE_SUPABASE_URL } from "./private-access-stage-config";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (
  process.env.VQ_COMBINED_STAGE_BUILD === "1" &&
  (configuredUrl !== STAGE_SUPABASE_URL ||
    !configuredKey ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(configuredKey))
) {
  throw new Error(
    "The combined staging build requires the isolated Supabase URL and publishable key.",
  );
}

// Publishable credentials are intentionally public. RLS and admin RPC authorization protect writes.
export const supabaseUrl =
  configuredUrl || "https://uowearboulykfcwnuirn.supabase.co";
export const publishableKey =
  configuredKey || "sb_publishable_O6zAOHpbYpSg4UF3qJkZvA_2QqzIuvP";
// Combined staging has one HttpOnly server identity. Do not load, refresh or
// overwrite a persisted browser SDK identity from an earlier visit to this host.
// Original production browser authentication remains unchanged.
export const supabase = createClient(
  supabaseUrl,
  publishableKey,
  process.env.VQ_COMBINED_STAGE_BUILD === "1"
    ? {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    : undefined,
);
