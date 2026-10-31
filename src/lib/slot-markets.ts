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
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "made threes",
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
  sport: "nfl" | "nba" = "nfl",
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
    if (
      sport === "nba" &&
      ![
        "h2h",
        "spreads",
        "totals",
        "player_points",
        "player_rebounds",
        "player_assists",
        "player_threes",
      ].includes(base)
    )
      continue;
    if (
      sport === "nfl" &&
      [
        "player_points",
        "player_rebounds",
        "player_assists",
        "player_threes",
      ].includes(base)
    )
      continue;
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
        sport,
        observed_odds: outcome.price,
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

/** New-sport adapter: the selected sport is enforced before any random draw. */
export function sportSlotPool(
  page: import("./sport-contract").SportPage,
  sport: import("./sport-contract").NewSport,
  now = Date.now(),
): SlotLeg[] {
  if (page.sport !== sport || !page.access) return [];
  const games = new Map(
    page.games
      .filter(
        (g) =>
          g.sport === sport &&
          !g.completed &&
          !g.start_time_tbd &&
          Date.parse(g.start_time) > now,
      )
      .map((g) => [g.id, g]),
  );
  const latest = new Map<string, string>();
  for (const m of page.markets) {
    const k = `${m.game_id}|${m.market}`;
    if (m.sport === sport && (!latest.has(k) || m.observed_at > latest.get(k)!))
      latest.set(k, m.observed_at);
  }
  const seen = new Set<string>();
  return [...page.markets]
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .flatMap((m) => {
      const g = games.get(m.game_id);
      const permitted =
        sport === "ncaab"
          ? ["h2h", "spreads"]
          : [
              "h2h",
              "totals",
              "player_points",
              "player_goals",
              "player_goal_scorer_anytime",
            ];
      if (
        m.observed_at !== latest.get(`${m.game_id}|${m.market}`) ||
        !g ||
        m.sport !== sport ||
        m.book !== "FanDuel" ||
        !permitted.includes(m.market) ||
        Date.parse(m.observed_at) > now ||
        Date.parse(m.expires_at) <= now ||
        now - Date.parse(m.observed_at) > 30 * 60000 ||
        !Number.isFinite(Date.parse(m.observed_at)) ||
        !Number.isFinite(Date.parse(m.expires_at)) ||
        !m.source.url.startsWith("https://") ||
        !Number.isInteger(m.odds) ||
        Math.abs(m.odds) < 100
      )
        return [];
      const family = m.player
        ? `player:${m.athlete_id || m.player.toLowerCase()}`
        : m.market === "totals"
          ? "game-total"
          : "team-side";
      const k = JSON.stringify([
        sport,
        g.id,
        m.market,
        m.selection,
        m.player,
        m.athlete_id,
        m.direction,
        m.line,
      ]);
      if (seen.has(k)) return [];
      seen.add(k);
      const label =
        m.market === "h2h"
          ? "Moneyline"
          : m.market === "spreads"
            ? `Spread ${m.line! > 0 ? "+" : ""}${m.line}`
            : m.market === "totals"
              ? `${m.direction} ${m.line} total goals`
              : m.market === "player_goal_scorer_anytime"
                ? "Anytime goal"
                : `${m.direction} ${m.line} ${m.market === "player_points" ? "points" : "goals"}`;
      return [
        {
          sport,
          leg_key: `market:${sport}:${m.id}`,
          name:
            m.player ||
            (m.market === "totals"
              ? `${g.away.name} @ ${g.home.name}`
              : m.selection),
          market: label,
          matchup: `${g.away.name} @ ${g.home.name}`,
          game_id: g.id,
          expires_at: new Date(
            Math.min(Date.parse(m.expires_at), Date.parse(g.start_time)),
          ).toISOString(),
          published_at: m.observed_at,
          kind: "MARKET",
          result: null,
          copy_text: null,
          selection_group: family,
          source_url: m.source.url,
          book: m.book,
          observed_at: m.observed_at,
          observation_id: m.id,
          observed_odds: m.odds,
        },
      ];
    });
}
