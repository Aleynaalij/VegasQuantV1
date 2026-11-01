import { NextResponse } from "next/server";
import { isLiveSport } from "@/lib/live-scores";
import { fetchLiveGames } from "@/lib/live-fetch";

export const runtime = "nodejs";

/**
 * Live scores for one sport: ESPN's public scoreboard for yesterday and today (ET), cached 20
 * seconds so every visitor shares one upstream read. Scores only; no member data.
 */
export async function GET(req: Request) {
  const sport = new URL(req.url).searchParams.get("sport");
  if (!isLiveSport(sport))
    return NextResponse.json({ error: "Unknown sport" }, { status: 400 });
  // UI checks run against synthetic data; real live games would make them depend on the clock.
  if (process.env.LIVE_SCORES_DISABLED === "1")
    return NextResponse.json({ sport, games: [], disabled: true });
  try {
    const games = await fetchLiveGames(sport);
    return NextResponse.json(
      {
        sport,
        games,
        retrievedAt: new Date().toISOString(),
        source: "ESPN",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { sport, games: [], unavailable: true },
      { status: 503 },
    );
  }
}
