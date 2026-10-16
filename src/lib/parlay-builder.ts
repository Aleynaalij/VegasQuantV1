import { homeWeekStart } from "./home-week";
export type PublishedLeg = {
  leg_key: string;
  name: string;
  market: string;
  matchup: string;
  game_id: string | null;
  kind: string;
  quote: string | null;
  quote_observed_at: string | null;
  published_at: string;
  expires_at: string;
  result: string | null;
  why: string;
  risk: string;
  copy_text: string | null;
  recommendation?: {
    edge_pp: number;
    model_id: string;
    validation_url: string;
  } | null;
};
export type MemberParlay = {
  id: string;
  title: string;
  legs: PublishedLeg[];
  created_at: string;
  expires_at: string;
};
const stat =
  /(?:over\s+|under\s+)?\d+(?:\.\d+)?\+?\s+(?:(?:receiving|rushing|passing)\s+(?:yards|yds)|receptions|catches)\b/i;
/** Only player + stat; never copy the game, phase, date, price or explanatory prose. */
export function parlayCopyLine(
  leg: Pick<PublishedLeg, "name" | "market">,
): string | null {
  const target = leg.market.match(stat)?.[0];
  const player = leg.name.trim();
  if (target && player && !/[\r\n]/.test(player) && !stat.test(player))
    return `${player} ${target}`;
  if (leg.market === "Player Prop") {
    const match = player.match(new RegExp(`^(.+?)\\s+(${stat.source})$`, "i"));
    if (match) return `${match[1]} ${match[2]}`;
  }
  return null;
}
export function legFamily(leg: PublishedLeg): string {
  const line = parlayCopyLine(leg) || "";
  const match = line.match(stat);
  return `${leg.game_id}:${line.slice(0, match?.index).trim().toLowerCase()}:${match?.[0]
    .replace(/^(?:over|under)\s+/i, "")
    .replace(/[\d.+]/g, "")
    .trim()
    .toLowerCase()
    .replace(/yds/g, "yards")
    .replace(/catches/g, "receptions")}`;
}
export function canBuildWith(leg: PublishedLeg, now = Date.now()): boolean {
  return Boolean(
    leg.game_id &&
      !leg.result &&
      Date.parse(leg.expires_at) > now &&
      !/quarter|half|live/i.test(leg.market) &&
      parlayCopyLine(leg),
  );
}
export function weeklyLegs(
  rows: PublishedLeg[],
  now = new Date(),
): PublishedLeg[] {
  const seen = new Set<string>();
  return rows
    .filter(
      (r) =>
        parlayCopyLine(r) &&
        Date.parse(r.published_at) >= Date.parse(homeWeekStart(now)),
    )
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .filter((r) => {
      const key = `${r.game_id || r.matchup}:${parlayCopyLine(r)?.toLowerCase() || `${r.name}:${r.market}`.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function selectionError(
  chosen: PublishedLeg[],
  next: PublishedLeg,
  now = Date.now(),
): string | null {
  if (!canBuildWith(next, now))
    return "This leg is closed or unavailable for a new parlay.";
  if (chosen.length >= 7) return "Keep your parlay to seven legs or fewer.";
  if (
    chosen.some(
      (r) => r.leg_key === next.leg_key || legFamily(r) === legFamily(next),
    )
  )
    return "Choose one target per player and stat. Remove the existing target first.";
  return null;
}
export function parlayCopy(legs: PublishedLeg[]): string {
  const lines = legs.map(parlayCopyLine);
  if (lines.some((l) => !l)) throw Error("A player/stat line is missing.");
  return lines.join("\n");
}
