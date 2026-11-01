import { NextResponse } from "next/server";
import {
  isLiveSport,
  LIVE_PATHS,
  parseScoreboard,
  scoreboardDays,
} from "@/lib/live-scores";

export const runtime = "nodejs";

/**
 * Live scores for one sport: ESPN's public scoreboard for yesterday and today (ET), cached 20
 * seconds so every visitor shares one upstream read. Scores only; no member data.
 */
export async function GET(req: Request) {
  const sport = new URL(req.url).searchParams.get("sport");
  if (!isLiveSport(sport))
    return NextResponse.json({ error: "Unknown sport" }, { status: 400 });
  try {
    const boards = await Promise.all(
      scoreboardDays().map(async (day) => {
        const r = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/${LIVE_PATHS[sport]}/scoreboard?dates=${day}&limit=500${sport === "ncaab" ? "&groups=50" : ""}`,
          { next: { revalidate: 20 }, signal: AbortSignal.timeout(8000) },
        );
        if (!r.ok) throw Error(`Scores ${r.status}`);
        return parseScoreboard(await r.json());
      }),
    );
    return NextResponse.json(
      {
        sport,
        games: boards.flat(),
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
