import { NextResponse } from "next/server";
export async function GET() {
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("Scores unavailable");
    const data = await r.json();
    const games = (data.events || []).map((e: { id: string; date: string; competitions: { competitors: { homeAway: string; score: string; team: { abbreviation: string } }[] }[]; status: { type: { state: string; shortDetail: string } } }) => {
      const teams = e.competitions?.[0]?.competitors || [];
      const away = teams.find(t => t.homeAway === "away"), home = teams.find(t => t.homeAway === "home");
      return { id: e.id, kickoff: e.date, away: away?.team.abbreviation, home: home?.team.abbreviation, awayScore: away?.score, homeScore: home?.score, state: e.status?.type?.state, detail: e.status?.type?.shortDetail };
    });
    return NextResponse.json({ games, retrievedAt: new Date().toISOString(), source: "ESPN" });
  } catch { return NextResponse.json({ games: [], error: "Score feed unavailable" }, { status: 503 }); }
}
