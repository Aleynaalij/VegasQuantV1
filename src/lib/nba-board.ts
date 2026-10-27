export type NbaGame = {
  id: string;
  provider_id: string;
  slug: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
  tipoff: string;
  tipoff_tbd: boolean;
  venue: string | null;
  season: number | null;
  season_type: number | null;
  status: string | null;
  away_score: number | null;
  home_score: number | null;
  source: string;
  updated_at: string;
};
export type NbaObservation = {
  id: string;
  game_id: string;
  kind: string;
  provider: string;
  source: string;
  observed_at: string | null;
  recorded_at: string;
  payload: Record<string, unknown>;
};
export function nbaPhase(type: number | null) {
  return type === 1
    ? "Preseason"
    : type === 2
      ? "Regular season"
      : type === 3
        ? "Postseason"
        : "Season phase unknown";
}
export function nbaStatus(g: NbaGame, now: number) {
  const status = g.status || "";
  if (/CANCEL|POSTPON|SUSPEND/.test(status))
    return status.replace("STATUS_", "").replaceAll("_", " ").toLowerCase();
  if (/FINAL/.test(status)) return "Final";
  if (/IN_PROGRESS|HALFTIME|END_PERIOD/.test(status)) return "Live";
  if (g.tipoff_tbd) return "Tip time TBD";
  return Date.parse(g.tipoff) <= now ? "Awaiting game update" : "Scheduled";
}
export function nbaHasScore(g: NbaGame) {
  return (
    /FINAL|IN_PROGRESS|HALFTIME|END_PERIOD/.test(g.status || "") &&
    g.away_score !== null &&
    g.home_score !== null
  );
}
/** Receipt time orders revisions, including a provider snapshot that withdraws outcomes. */
export function latestNbaObservations(rows: NbaObservation[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(b.recorded_at) - Date.parse(a.recorded_at) ||
      b.id.localeCompare(a.id),
  );
  const seen = new Set<string>();
  return sorted.filter((r) => {
    const key = `${r.game_id}|${r.kind}|${String(r.payload.book || r.provider)}|${r.kind === "injury" ? String(r.payload.team) + "|" + String(r.payload.player) : String(r.payload.market)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function nbaFreshness(
  at: string | null,
  now: number,
  maxAgeMinutes: number,
) {
  const t = Date.parse(at || "");
  return !Number.isFinite(t) || t > now
    ? "Time unknown"
    : now - t > maxAgeMinutes * 60000
      ? "Older snapshot"
      : "Recent snapshot";
}
export function nbaOdds(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    Math.abs(value) >= 100
    ? `${value > 0 ? "+" : ""}${value}`
    : "Price unknown";
}
export function nbaOutcomes(payload: Record<string, unknown>) {
  const rows = Array.isArray(payload.outcomes) ? payload.outcomes : [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const r = value as Record<string, unknown>;
    if (typeof r.name !== "string") return [];
    return [
      {
        name: r.name,
        point:
          typeof r.point === "number" && Number.isFinite(r.point)
            ? r.point
            : null,
        price: nbaOdds(r.price),
      },
    ];
  });
}
export function nbaSource(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export const nbaMarkets: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "Threes",
};
const books = new Set([
  "FanDuel",
  "DraftKings",
  "BetMGM",
  "Caesars",
  "BetRivers",
  "Fanatics",
]);
export type NbaComparison = {
  key: string;
  market: string;
  player: string;
  side: string;
  point: number | null;
  quotes: {
    book: string;
    price: number;
    observed_at: string | null;
    recorded_at: string;
    source: string;
    fresh: boolean;
  }[];
  best: number | null;
};
const decimal = (n: number) => (n > 0 ? 1 + n / 100 : 1 + 100 / -n);
/** Compare only identical market/player/side/line. Stale/unknown times never win. */
export function nbaComparisons(
  rows: NbaObservation[],
  now: number,
): NbaComparison[] {
  const groups = new Map<string, NbaComparison>();
  for (const r of latestNbaObservations(rows)) {
    const market = String(r.payload.market || ""),
      book = String(r.payload.book || "");
    if (
      !books.has(book) ||
      !nbaMarkets[market] ||
      !["odds", "prop"].includes(r.kind)
    )
      continue;
    for (const raw of Array.isArray(r.payload.outcomes)
      ? r.payload.outcomes
      : []) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      if (
        typeof o.name !== "string" ||
        typeof o.price !== "number" ||
        nbaOdds(o.price) === "Price unknown"
      )
        continue;
      const player =
        r.kind === "prop" && typeof o.description === "string"
          ? o.description.trim()
          : "";
      if (r.kind === "prop" && !player) continue;
      const point =
        typeof o.point === "number" && Number.isFinite(o.point)
          ? o.point
          : null;
      if (market !== "h2h" && point === null) continue;
      const key = JSON.stringify([r.game_id, market, player, o.name, point]);
      const group = groups.get(key) || {
        key,
        market,
        player,
        side: o.name,
        point,
        quotes: [],
        best: null,
      };
      const fresh =
        nbaFreshness(r.observed_at, now, 15) === "Recent snapshot" &&
        !!nbaSource(r.source);
      group.quotes.push({
        book,
        price: o.price,
        observed_at: r.observed_at,
        recorded_at: r.recorded_at,
        source: r.source,
        fresh,
      });
      if (
        fresh &&
        (group.best === null || decimal(o.price) > decimal(group.best))
      )
        group.best = o.price;
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.market.localeCompare(b.market) ||
      a.player.localeCompare(b.player) ||
      a.side.localeCompare(b.side) ||
      (a.point || 0) - (b.point || 0),
  );
}
