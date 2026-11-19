import type { HubData } from "./research-hub-reader";

/** Same-origin HttpOnly identity bridge. Never expose a token or accept a backend URL. */
async function read(resource: string, request = fetch) {
  const response = await request(`/staging/discovery/read/${resource}`, {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Staging research access unavailable");
  return response.json();
}
export async function readStageResearch(request = fetch): Promise<HubData> {
  const value = await read("research", request);
  if (
    !value ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.errors) ||
    value.denied !== false ||
    value.signedIn !== true ||
    typeof value.truncated !== "boolean"
  )
    throw new Error("Invalid staging research response");
  return value;
}
