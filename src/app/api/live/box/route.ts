import { NextResponse } from "next/server";
import { LIVE_PATHS } from "@/lib/live-scores";
import { parseLiveBox } from "@/lib/live-sweat";

export const runtime = "nodejs";

/**
 * Live player stats for one NBA or NHL game (ESPN summary), for sweating player props. Cached 20
 * seconds for everyone; public box-score numbers only.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sport = q.get("sport"),
    id = q.get("id") || "";
  if ((sport !== "nba" && sport !== "nhl") || !/^\d{1,15}$/.test(id))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // UI checks run against synthetic data (see /api/live).
  if (process.env.LIVE_SCORES_DISABLED === "1")
    return NextResponse.json({ players: {}, disabled: true });
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${LIVE_PATHS[sport]}/summary?event=${id}`,
      { next: { revalidate: 20 }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw Error(`Box ${r.status}`);
    const players = parseLiveBox(sport, await r.json());
    if (!players) throw Error("Unreadable box score");
    return NextResponse.json(
      { players, retrievedAt: new Date().toISOString(), source: "ESPN" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { players: null, unavailable: true },
      { status: 503 },
    );
  }
}
