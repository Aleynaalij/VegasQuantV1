import type { NbaSheetResponse } from "./nba-matchup-sheet";
import { supabase } from "./supabase";

export async function fetchNbaMatchupSheet(
  id: string,
  signal: AbortSignal,
  userId?: string,
) {
  if (process.env.VQ_COMBINED_STAGE_BUILD === "1") {
    const { readViewerIdentity } = await import("./viewer-auth");
    const viewer = await readViewerIdentity();
    signal.throwIfAborted();
    if (
      viewer.state !== "ready" ||
      !viewer.capabilities.research ||
      (userId && viewer.session?.user.id !== userId)
    )
      throw Error(
        "Full matchup sheets and downloads are unavailable until their isolated publication and source contracts are verified.",
      );
    const r = await fetch(
      `/staging/discovery/read/matchup-sheet/${encodeURIComponent(id)}`,
      {
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
      },
    );
    if (!r.ok) throw Error("Matchup sheet unavailable.");
    return (await r.json()) as NbaSheetResponse;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  signal.throwIfAborted();
  if (!session || (userId && session.user.id !== userId))
    throw Error("Sign in to open the full matchup sheet.");

  const response = await fetch(
    `/api/nba/matchup-sheet/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal,
    },
  );
  const data = (await response.json()) as NbaSheetResponse & { error?: string };
  if (!response.ok) throw Error(data.error || "Matchup sheet unavailable.");
  return data;
}

export function matchupSheetImageUrl(svg: string) {
  return URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
}
