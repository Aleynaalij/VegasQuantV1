import { paths } from "../sports-sync/normalize.ts";
import type {
  NewSport,
  SportGame,
  SportSource,
} from "../../../src/lib/sport-contract.ts";
export type PlayerResult = {
  athlete_id: string;
  player: string;
  side: "away" | "home";
  played: boolean;
  participation_uncertain?: boolean;
  seconds: number | null;
  points: number | null;
  goals: number | null;
  assists: number | null;
  power_play_seconds: number | null;
};
export type ResultPayload = {
  sport: NewSport;
  provider_id: string;
  completed: boolean;
  status: string;
  away_score: number | null;
  home_score: number | null;
  shootout: boolean;
  players: PlayerResult[];
  source: SportSource;
};
const count = (v: unknown) =>
  typeof v === "string" && /^\d+$/.test(v)
    ? Number(v)
    : typeof v === "number" && Number.isInteger(v) && v >= 0
      ? v
      : null;
const seconds = (v: unknown) =>
  typeof v === "string" && /^\d+:\d{2}$/.test(v) && Number(v.split(":")[1]) < 60
    ? Number(v.split(":")[0]) * 60 + Number(v.split(":")[1])
    : null;
export function parseResult(
  data: any,
  game: SportGame,
  source: SportSource,
): ResultPayload {
  if (String(data.header?.id) !== game.provider_id)
    throw Error("Summary event identity mismatch");
  const c = data.header?.competitions?.[0],
    status = c?.status?.type;
  const final = status?.completed === true && status?.name === "STATUS_FINAL";
  const sides = new Map<string, "away" | "home">([
    [game.away.provider_id, "away"],
    [game.home.provider_id, "home"],
  ]);
  let away: number | null = null,
    home: number | null = null;
  for (const t of c?.competitors || []) {
    const side = sides.get(String(t.team?.id));
    if (!side || side !== t.homeAway)
      throw Error("Summary team identity mismatch");
    if (side === "away") away = count(t.score);
    else home = count(t.score);
  }
  const out: ResultPayload = {
    sport: game.sport,
    provider_id: game.provider_id,
    completed: final,
    status: status?.name || "UNKNOWN",
    away_score: away,
    home_score: home,
    shootout: /\bSO\b|shootout/i.test(
      status?.detail || status?.shortDetail || "",
    ),
    players: [],
    source,
  };
  if (!final) return out;
  if (away === null || home === null || away === home)
    throw Error("Invalid final score");
  for (const t of data.boxscore?.players || []) {
    const side = sides.get(String(t.team?.id));
    if (!side) throw Error("Foreign box score team");
    for (const s of t.statistics || []) {
      if (game.sport === "nhl" && s.name === "goalies") continue;
      if (!s.athletes?.length) continue;
      const idx = (k: string) => s.keys?.indexOf(k) ?? -1;
      const required =
        game.sport === "nhl"
          ? ["goals", "assists", "timeOnIce"]
          : ["points", "assists", "minutes"];
      if (required.some((k) => idx(k) < 0))
        throw Error("Missing box score columns");
      for (const a of s.athletes) {
        const played =
          a.didNotPlay !== true &&
          a.athlete?.scratched !== true &&
          (a.stats?.length || 0) > 0;
        const st = a.stats || [],
          stat = (k: string) => (played ? count(st[idx(k)]) : null);
        const sec = played
          ? game.sport === "nhl"
            ? seconds(st[idx("timeOnIce")])
            : /^\d+$/.test(st[idx("minutes")] || "")
              ? Number(st[idx("minutes")]) * 60
              : seconds(st[idx("minutes")])
          : null;
        const goals = game.sport === "nhl" ? stat("goals") : null,
          assists = stat("assists");
        const points =
          game.sport === "nhl"
            ? goals !== null && assists !== null
              ? goals + assists
              : null
            : stat("points");
        if (
          !/^\d+$/.test(String(a.athlete?.id)) ||
          !a.athlete?.displayName ||
          (played && (points === null || assists === null || sec === null))
        )
          throw Error("Unreadable player result");
        // A zero time row does not prove NHL participation; do not turn it into an automatic loss.
        out.players.push({
          participation_uncertain: game.sport === "nhl" && played && sec === 0,
          athlete_id: String(a.athlete.id),
          player: a.athlete.displayName,
          side,
          played: played && (game.sport !== "nhl" || sec! > 0),
          seconds: sec,
          points,
          goals,
          assists,
          power_play_seconds:
            game.sport === "nhl" && played
              ? seconds(st[idx("powerPlayTimeOnIce")])
              : null,
        });
      }
    }
  }
  if (
    game.sport === "nhl" &&
    away +
      home -
      out.players.filter((p) => p.played).reduce((n, p) => n + p.goals!, 0) !==
      (out.shootout ? 1 : 0)
  )
    throw Error("Shootout score conservation failed");
  if (new Set(out.players.map((p) => p.athlete_id)).size !== out.players.length)
    throw Error("Duplicate athlete");
  for (const side of ["away", "home"] as const) {
    const players = out.players.filter((p) => p.side === side && p.played);
    if (!players.length) throw Error("Missing player box score");
    const total = players.reduce(
        (n, p) => n + (game.sport === "nhl" ? p.goals! : p.points!),
        0,
      ),
      score = side === "away" ? away : home;
    const gap = score - total;
    if (
      (game.sport === "ncaab" && gap !== 0) ||
      (game.sport === "nhl" &&
        (gap < 0 || gap > 1 || (!out.shootout && gap !== 0)))
    )
      throw Error("Player scoring does not match team score");
  }
  return out;
}
export const resultSourceUrl = (sport: NewSport, id: string) =>
  `https://www.espn.com/${sport === "nhl" ? "nhl" : "mens-college-basketball"}/boxscore/_/gameId/${id}`;
