// ESPN NBA game summary -> the payload public.record_nba_result checks and records. Parsing only:
// the database decides whether a box score adds up and when a final is confirmed.
type StatusType = { name?: string; completed?: boolean; detail?: string; shortDetail?: string };
type Summary = {
  header?: {
    competitions?: {
      status?: { type?: StatusType };
      competitors?: { homeAway: string; score?: string; team?: { displayName?: string }; linescores?: unknown[] }[];
    }[];
  };
  boxscore?: {
    players?: {
      team?: { displayName?: string };
      statistics?: {
        keys?: string[];
        totals?: string[];
        athletes?: { athlete?: { id?: string; displayName?: string; position?: { abbreviation?: string } }; stats?: string[]; didNotPlay?: boolean; starter?: boolean }[];
      }[];
    }[];
  };
};
export type Game = { provider_id: string; away_team: string; home_team: string };

/** Same spelling rule as nba-sync: games are stored under The Odds API's team names. */
const ALIASES: Record<string, string> = { "LA Clippers": "Los Angeles Clippers" };
export const canonicalTeam = (name: string) => ALIASES[name?.trim()] || name?.trim();
export const boxscoreUrl = (id: string) => `https://www.espn.com/nba/boxscore/_/gameId/${id}`;
export const summaryUrl = (id: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`;

const count = (v: string | undefined) => (/^\d+$/.test(v ?? "") ? Number(v) : NaN);
const made = (v: string | undefined) => count((v ?? "").split("-")[0]);
const attempted = (v: string | undefined) => count((v ?? "").split("-")[1]);
const STATS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers"] as const;
const THREES = "threePointFieldGoalsMade-threePointFieldGoalsAttempted";

export function resultPayload(data: Summary, game: Game, sourceHash: string) {
  const comp = data.header?.competitions?.[0];
  const status = comp?.status?.type;
  const base = { provider_id: game.provider_id, status: status?.name ?? null };
  if (status?.completed !== true || status?.name !== "STATUS_FINAL") return { ...base, completed: false as const };

  const sides: Record<string, "away" | "home"> = { [game.away_team]: "away", [game.home_team]: "home" };
  const teams: Record<string, { team: string; score: number; rebounds?: number; assists?: number; threes?: number }> = {};
  for (const c of comp?.competitors || []) {
    if (c.homeAway !== "away" && c.homeAway !== "home") continue;
    teams[c.homeAway] = { team: canonicalTeam(c.team?.displayName || ""), score: count(c.score) };
  }
  const overtime =
    /OT/.test(status.detail || status.shortDetail || "") ||
    (comp?.competitors || []).some((c) => (c.linescores?.length || 0) > 4);

  const players = [];
  for (const t of data.boxscore?.players || []) {
    const side = sides[canonicalTeam(t.team?.displayName || "")];
    const s = t.statistics?.[0];
    if (!side || !s?.keys) return `Box score team ${t.team?.displayName ?? "?"} is not in this game`;
    const at = (k: string) => s.keys!.indexOf(k);
    if ([...STATS, "minutes", THREES].some((k) => at(k) < 0)) return "Box score is missing a stat column";
    const totals = s.totals || [];
    teams[side] = { ...teams[side], rebounds: count(totals[at("rebounds")]), assists: count(totals[at("assists")]), threes: made(totals[at(THREES)]) };
    for (const a of s.athletes || []) {
      const played = a.didNotPlay !== true && (a.stats?.length || 0) > 0;
      const st = a.stats || [];
      const row = {
        athlete_id: a.athlete?.id ?? "",
        player: a.athlete?.displayName ?? "",
        side,
        played,
        starter: a.starter === true,
        position: /^[A-Z]{1,3}$/.test(a.athlete?.position?.abbreviation || "") ? a.athlete!.position!.abbreviation! : null,
        minutes: played ? (Number.isFinite(count(st[at("minutes")])) ? count(st[at("minutes")]) : null) : null,
        threes: played ? made(st[at(THREES)]) : 0,
        three_attempts: played ? attempted(st[at(THREES)]) : 0,
        ...Object.fromEntries(STATS.map((k) => [k, played ? count(st[at(k)]) : 0])),
      };
      if ([row.threes, row.three_attempts, ...STATS.map((k) => (row as Record<string, unknown>)[k])].some((v) => !Number.isFinite(v)))
        return `Unreadable stat line for ${row.player || "a player"}`;
      if (row.three_attempts < row.threes) return `More threes made than attempted for ${row.player || "a player"}`;
      players.push(row);
    }
  }
  if (!teams.away || !teams.home) return "Summary is missing a team";
  return {
    ...base,
    completed: true as const,
    overtime,
    source_url: boxscoreUrl(game.provider_id),
    source_hash: sourceHash,
    away: teams.away,
    home: teams.home,
    players,
  };
}

const HOUR = 3600000;
/** Games to read this run: past tip by 2 hours and within 4 days until recorded; recorded or
 *  conflicting games are re-read every 6 hours for 3 days to catch provider corrections. */
export function dueGames<G extends { id: string; tipoff: string }>(
  games: G[],
  progress: Map<string, { status: string; checked_at: string }>,
  now: number,
  limit = 20,
) {
  return games
    .filter((g) => {
      const tip = Date.parse(g.tipoff);
      if (!(tip <= now - 2 * HOUR && tip > now - 4 * 24 * HOUR)) return false;
      const p = progress.get(g.id);
      if (!p) return true;
      const since = now - Date.parse(p.checked_at);
      if (p.status === "FINAL" || p.status === "CONFLICT") return tip > now - 3 * 24 * HOUR && since >= 6 * HOUR;
      if (p.status === "NO_RESULT") return since >= 6 * HOUR;
      return true;
    })
    .sort((a, b) => Date.parse(progress.get(a.id)?.checked_at || "1970-01-01") - Date.parse(progress.get(b.id)?.checked_at || "1970-01-01"))
    .slice(0, limit);
}
