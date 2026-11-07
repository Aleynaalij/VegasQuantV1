import { createHash } from "node:crypto";
import { requestUser } from "@/lib/billing-server";
import {
  nbaMatchupSheetSlug,
  type NbaSheetSource,
} from "@/lib/nba-matchup-sheet";
import { loadNbaMatchupSheet } from "@/lib/nba-matchup-sheet-server";
import { nbaMatchupSheetSvg } from "@/lib/nba-matchup-sheet-svg";
import type { PublicationPost } from "@/lib/zone-publication-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (data: object, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id))
    return reply({ error: "Matchup sheet unavailable." }, 404);
  try {
    const auth = await requestUser(req);
    if (!auth)
      return reply({ error: "Sign in to open the full matchup sheet." }, 401);
    const [access, age, post] = await Promise.all([
      auth.db.rpc("membership_status"),
      auth.db.rpc("age_verification_status"),
      auth.db
        .from("community_posts")
        .select("id,title,body,sport,legs,created_at,card")
        .eq("id", id)
        .maybeSingle<PublicationPost>(),
    ]);
    if (
      access.error ||
      age.error ||
      typeof age.data?.required !== "boolean" ||
      typeof age.data?.verified !== "boolean"
    )
      return reply({ error: "Research access could not be checked." }, 503);
    if (
      access.data?.allowed !== true ||
      (age.data.required && !age.data.verified)
    )
      return reply(
        { error: "Research access is required for the full matchup sheet." },
        403,
      );
    if (post.error) throw post.error;
    const slug = post.data && nbaMatchupSheetSlug(post.data);
    if (!slug) return reply({ error: "Matchup sheet unavailable." }, 404);

    const sheet = await loadNbaMatchupSheet(auth.db, slug, post.data!.body);
    if (!sheet) return reply({ error: "Matchup sheet unavailable." }, 404);
    const { game, availability } = sheet;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(game.tipoff));
    const expected = createHash("md5")
      .update(`nba-matchup-cheat-sheet:${day}:${game.id}`)
      .digest("hex");
    if (
      expected !== id.replaceAll("-", "") ||
      post.data!.title !==
        `NBA Matchup Cheat Sheet · ${game.away_team} @ ${game.home_team}`
    )
      return reply({ error: "Matchup sheet unavailable." }, 404);

    const sources: NbaSheetSource[] = [
      { label: "Vegas Quant matchup", href: `/nba/games/${slug}` },
    ];
    if (/^\d+$/.test(game.provider_id))
      sources.push({
        label: "ESPN matchup",
        href: `https://www.espn.com/nba/game/_/gameId/${game.provider_id}`,
      });
    if (availability)
      sources.push({ label: "NBA injury report", href: availability.url });
    sources.push({
      label: "Odds feed",
      href: "https://the-odds-api.com/sports-odds-data/nba-odds.html",
    });
    const seen = new Set<string>();
    for (const team of sheet.teams) {
      for (const final of team.finals) {
        if (!/^\d+$/.test(final.providerId) || seen.has(final.providerId))
          continue;
        seen.add(final.providerId);
        sources.push({
          label: `${team.code} vs ${final.opponent} · ${final.points}-${final.against}`,
          href: `https://www.espn.com/nba/boxscore/_/gameId/${final.providerId}`,
        });
      }
    }
    return reply({
      title: `${game.away_team} at ${game.home_team}`,
      summary:
        availability?.text ??
        "No linked official game report in the Dealer post.",
      sources,
      svg: nbaMatchupSheetSvg(sheet),
    });
  } catch {
    return reply(
      { error: "The matchup sheet could not load. Please retry." },
      503,
    );
  }
}
