import { supabaseUrl, publishableKey } from "./supabase";
import type { Desk } from "./domain";
export async function getDesk(): Promise<Desk> {
  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/desk_data`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok)
    throw new Error("The research desk could not load. Please try again.");
  return r.json();
}
