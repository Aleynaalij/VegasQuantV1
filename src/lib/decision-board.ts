export type BoardGame = {
  id: string;
  slug: string;
  kickoff: string;
  away_team: string;
  home_team: string;
};
export type BoardTarget = {
  id: string;
  game_id: string;
  analysis_version_id?: string | null;
  selection: string;
  status: string;
  updated_at: string;
  current_number: string | null;
  current_odds: number | null;
  what_we_are_waiting_for: string;
  playable_number: string | null;
  why_we_like_it: string;
  rank: number;
};
export function easternDay(at: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function gameWindow(kickoff: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(kickoff)),
  );
  return hour < 16 ? "early" : hour < 19 ? "afternoon" : "evening";
}
export function windowDecision(
  games: BoardGame[],
  targets: BoardTarget[],
  day: string,
  window: string,
  now: number,
) {
  const scheduled = games.filter(
    (g) =>
      Number.isFinite(Date.parse(g.kickoff)) &&
      easternDay(Date.parse(g.kickoff)) === day &&
      gameWindow(g.kickoff) === window,
  );
  const upcoming = scheduled.filter((g) => Date.parse(g.kickoff) > now);
  const latestVersions = new Map<string, BoardTarget>();
  for (const t of targets) {
    if (
      Date.parse(t.updated_at) > now ||
      !Number.isFinite(Date.parse(t.updated_at))
    )
      continue;
    const previous = latestVersions.get(t.game_id);
    if (!previous || Date.parse(t.updated_at) > Date.parse(previous.updated_at))
      latestVersions.set(t.game_id, t);
  }
  const candidates = targets
    .filter(
      (t) =>
        upcoming.some((g) => g.id === t.game_id) &&
        Date.parse(t.updated_at) <= now &&
        (!latestVersions.get(t.game_id)?.analysis_version_id ||
          t.analysis_version_id ===
            latestVersions.get(t.game_id)?.analysis_version_id),
    )
    .sort(
      (a, b) =>
        a.rank - b.rank || Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  return { scheduled, upcoming, candidates };
}
