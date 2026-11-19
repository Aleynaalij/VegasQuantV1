import "server-only";
import { supabaseUrl, publishableKey } from "./supabase";
import { productionOwnerConfig } from "./production-owner-preview";

export function productionOwnerEnvironment() {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
}
export function productionOwnerPreviewConfigured() {
  return productionOwnerConfig(productionOwnerEnvironment()) !== null;
}
