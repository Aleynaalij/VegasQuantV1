import { supabaseUrl, publishableKey } from "./supabase";
import { emptyDesk, type Desk } from "./domain";
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
/**
 * For pages that also refresh in the browser: a failed server load renders an empty desk
 * flagged `unavailable` instead of the full-page error, and the client retries.
 */
export async function getDeskOrEmpty(): Promise<Desk> {
  try {
    return await getDesk();
  } catch {
    return { ...emptyDesk, unavailable: true };
  }
}
