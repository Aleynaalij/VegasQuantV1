/** FanDuel provider snapshots for entertainment, never an analyst publication. */
import type { SlotLeg } from "./vq-slots";
export type SlotGame = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff: string;
};
export type SlotObservation = {
  id: string;
  game_id: string;
  source: string;
  observed_at: string | null;
  recorded_at: string;
  payload: {
    book?: string;
    market?: string;
    provider_updated_at?: string;
    outcomes?: {
      name?: string;
      description?: string;
      point?: number;
      price?: number;
    }[];
  };
};
export const slotFreshnessMs = 24 * 60 * 60 * 1000;
const labels: Record<string, string> = {
  player_pass_yds: "passing yards",
  player_rush_yds: "rushing yards",
  player_reception_yds: "receiving yards",
  player_receptions: "receptions",
  player_pass_tds: "passing touchdowns",
  player_anytime_td: "anytime touchdown",
};
export function marketSlotPool(
  games: SlotGame[],
  observations: SlotObservation[],
  now = Date.now(),
): SlotLeg[] {
  const slate = new Map(
    games
      .filter(
        (g) =>
          Date.parse(g.kickoff) > now &&
          Date.parse(g.kickoff) <= now + 7 * slotFreshnessMs,
      )
      .map((g) => [g.id, g]),
  );
  const seen = new Set<string>();
  const rows: SlotLeg[] = [];
  for (const o of [...observations].sort((a, b) =>
    String(b.observed_at).localeCompare(String(a.observed_at)),
  )) {
    const g = slate.get(o.game_id),
      p = o.payload,
      market = p?.market || "",
      time = Date.parse(o.observed_at || ""),
      retrieved = Date.parse(o.recorded_at);
    if (
      !g ||
      p.book !== "FanDuel" ||
      !o.source.startsWith("https://") ||
      !Number.isFinite(time) ||
      !Number.isFinite(retrieved) ||
      time > now ||
      retrieved > now ||
      now - time > slotFreshnessMs
    )
      continue;
    const base = market.replace(/_alternate$/, ""),
      label = labels[base];
    if (!["h2h", "spreads", "totals"].includes(market) && !label) continue;
    const snapshotKey = `${g.id}|${market}`;
    if (seen.has(snapshotKey)) continue;
    seen.add(snapshotKey);
    for (const outcome of p.outcomes || []) {
      const direction = outcome.name || "",
        point = outcome.point;
      if (!Number.isFinite(outcome.price) || Math.abs(outcome.price!) < 100)
        continue;
      let name = "",
        selection = "",
        family = "";
      if (market === "h2h" || market === "spreads") {
        if (![g.home_team, g.away_team].includes(direction)) continue;
        if (market === "spreads" && !Number.isFinite(point)) continue;
        name = direction;
        selection =
          market === "h2h"
            ? "Moneyline"
            : `Spread ${point! > 0 ? "+" : ""}${point}`;
        family = "team-side";
      } else if (market === "totals") {
        if (!["Over", "Under"].includes(direction) || !Number.isFinite(point))
          continue;
        name = `${g.away_team} @ ${g.home_team}`;
        selection = `${direction} ${point} total points`;
        family = "game-total";
      } else {
        if (
          !outcome.description?.trim() ||
          !["Over", "Under", "Yes"].includes(direction)
        )
          continue;
        if (
          base !== "player_anytime_td" &&
          (!Number.isFinite(point) || point! < 0)
        )
          continue;
        name = outcome.description.trim();
        selection =
          base === "player_anytime_td"
            ? "Anytime touchdown"
            : `${direction} ${point} ${label}`;
        family = `player:${name.toLowerCase()}`;
      }
      rows.push({
        leg_key: `market:${g.id}:${market}:${name}:${selection}`,
        name,
        market: selection,
        matchup: `${g.away_team} @ ${g.home_team}`,
        game_id: g.id,
        expires_at: new Date(
          Math.min(Date.parse(g.kickoff), time + slotFreshnessMs),
        ).toISOString(),
        published_at: o.observed_at!,
        kind: "MARKET",
        result: null,
        copy_text: null,
        selection_group: family,
        source_url: o.source,
        book: "FanDuel",
        observed_at: o.observed_at!,
        observation_id: o.id,
      });
    }
  }
  return rows;
}
