import { NextResponse } from "next/server";
import { fetchLiveBox } from "@/lib/live-fetch";

export const runtime = "nodejs";

/**
 * Live player stats for one NBA or NHL game (ESPN summary), for sweating player props, with
 * whether ESPN marks that box final. Cached 20 seconds for everyone; public box-score numbers only.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const sport = q.get("sport"),
    id = q.get("id") || "";
  if ((sport !== "nba" && sport !== "nhl") || !/^\d{1,15}$/.test(id))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  // UI checks run against synthetic data (see /api/live).
  if (process.env.LIVE_SCORES_DISABLED === "1")
    return NextResponse.json({ players: {}, final: false, disabled: true });
  try {
    const { players, final } = await fetchLiveBox(sport, id);
    return NextResponse.json(
      { players, final, retrievedAt: new Date().toISOString(), source: "ESPN" },
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
