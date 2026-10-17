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
