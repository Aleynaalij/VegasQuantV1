/**
 * "Your pick is sweating" (owner, Oct 31 2026): where each published pick stands while its game is
 * live, from the live score and, for player props, ESPN's live box score. Read with the same columns
 * the graders settle on (NBA points/rebounds; NHL skater goals/assists, goalies excluded), but this
 * is a live read, not a result: the record is still settled by the graders after the final.
 */
import type { LiveGame } from "./live-scores";
import { playerKey } from "./best-price";

export type SweatPick = {
  id: string;
  market:
    | "h2h"
    | "spreads"
    | "totals"
    | "player_points"
    | "player_rebounds"
    | "player_goals"
    | "player_goal_scorer_anytime";
  side?: "home" | "away" | null;
  direction?: "Over" | "Under" | "Yes" | null;
  line?: number | null;
  player?: string | null;
};

export type BoxLine = {
  points: number;
  rebounds?: number;
  goals?: number;
  assists?: number;
};
/** Live box score by playerKey(name). */
export type LiveBox = Record<string, BoxLine>;

export type Sweat = {
  /** ahead: on course; behind: needs more (or is losing); hit / miss: decided already (or at the final); even: level. */
  state: "ahead" | "behind" | "even" | "hit" | "miss";
  label: string;
  detail: string;
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
const UNIT: Record<string, string> = {
  player_points: "PTS",
  player_rebounds: "REB",
  player_goals: "goals",
};

/**
 * Over/Under against a running count. An Over can only climb, so once past the line it has hit; an
 * Under past the line has lost. A whole-number line landing exactly at the final is a push.
 */
function overUnder(
  label: string,
  have: number,
  line: number,
  dir: "Over" | "Under",
  final: boolean,
  unit: string,
): Sweat {
  const so = `${num(have)} ${unit}`.trim();
  if (final && have === line)
    return { state: "even", label, detail: `${so}, push` };
  if (dir === "Over") {
    if (have > line) return { state: "hit", label, detail: `${so}, cleared` };
    return final
      ? { state: "miss", label, detail: `${so}, final` }
      : {
          state: "behind",
          label,
          detail: `${so}, needs ${Math.floor(line - have) + 1}`,
        };
  }
  if (have > line)
    return { state: "miss", label, detail: `${so}, over the line` };
  if (final) return { state: "hit", label, detail: `${so}, final` };
  const spare = Math.ceil(line - have) - 1;
  return {
    state: spare > 0 ? "ahead" : "even",
    label,
    detail: spare > 0 ? `${so}, ${spare} to spare` : `${so}, no room left`,
  };
}

/**
 * One pick's live standing, or null when it can't be read honestly (game not started, unknown
 * player in the box score, missing line). Never guesses.
 */
export function sweat(
  pick: SweatPick,
  g: LiveGame,
  box: LiveBox | null,
  teams: { away: string; home: string },
): Sweat | null {
  if (g.state === "pre" || g.away.score === null || g.home.score === null)
    return null;
  const final = g.state === "post";
  const [a, h] = [g.away.score, g.home.score];
  if (pick.market === "h2h" && pick.side) {
    const mine = pick.side === "home" ? h - a : a - h;
    const label = `${pick.side === "home" ? teams.home : teams.away} to win`;
    if (final)
      return {
        state: mine > 0 ? "hit" : "miss",
        label,
        detail: mine > 0 ? "won" : "lost",
      };
    return {
      state: mine > 0 ? "ahead" : mine < 0 ? "behind" : "even",
      label,
      detail:
        mine > 0
          ? `leading by ${mine}`
          : mine < 0
            ? `trailing by ${-mine}`
            : "tied",
    };
  }
  if (pick.market === "spreads" && pick.side && typeof pick.line === "number") {
    const margin = (pick.side === "home" ? h - a : a - h) + pick.line;
    const label = `${pick.side === "home" ? teams.home : teams.away} ${signed(pick.line)}`;
    const state = margin > 0 ? "ahead" : margin < 0 ? "behind" : "even";
    return {
      state: final
        ? margin > 0
          ? "hit"
          : margin < 0
            ? "miss"
            : "even"
        : state,
      label,
      detail:
        margin > 0
          ? `covering by ${num(margin)}`
          : margin < 0
            ? `short by ${num(-margin)}`
            : final
              ? "push"
              : "on the number",
    };
  }
  if (
    pick.market === "totals" &&
    typeof pick.line === "number" &&
    (pick.direction === "Over" || pick.direction === "Under")
  )
    return overUnder(
      `${pick.direction} ${num(pick.line)}`,
      a + h,
      pick.line,
      pick.direction,
      final,
      "total",
    );
  if (!pick.player || !box) return null;
  const row = box[playerKey(pick.player)];
  if (!row) return null;
  const name = pick.player.split(" ").slice(-1)[0];
  if (pick.market === "player_goal_scorer_anytime") {
    const goals = row.goals;
    if (typeof goals !== "number") return null;
    const label = `${name} to score`;
    return goals > 0
      ? {
          state: "hit",
          label,
          detail: `${goals} goal${goals === 1 ? "" : "s"}`,
        }
      : {
          state: final ? "miss" : "behind",
          label,
          detail: final ? "no goal" : "no goal yet",
        };
  }
  if (
    typeof pick.line !== "number" ||
    (pick.direction !== "Over" && pick.direction !== "Under")
  )
    return null;
  const nhlPoints =
    pick.market === "player_points" && typeof row.goals === "number";
  const have = nhlPoints
    ? row.goals! + (row.assists ?? NaN)
    : pick.market === "player_points"
      ? row.points
      : pick.market === "player_rebounds"
        ? row.rebounds
        : row.goals;
  if (typeof have !== "number" || !Number.isFinite(have)) return null;
  const unit = nhlPoints ? "pts" : UNIT[pick.market] || "";
  return overUnder(
    `${name} ${pick.direction === "Over" ? "O" : "U"} ${num(pick.line)} ${unit}`,
    have,
    pick.line,
    pick.direction,
    final,
    unit,
  );
}

/** "14:02" → 842 seconds; anything else is unknown. */
const iceSeconds = (v: unknown) =>
  typeof v === "string" && /^\d+:[0-5]\d$/.test(v)
    ? Number(v.split(":")[0]) * 60 + Number(v.split(":")[1])
    : NaN;
const count = (v: unknown) =>
  typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;

/**
 * ESPN summary → live box score, by player. Same columns the graders read; goalies are skipped for
 * NHL. Players with no stat row yet are left out (unknown), never counted as zero.
 */
export function parseLiveBox(
  sport: "nba" | "nhl",
  data: unknown,
): LiveBox | null {
  const players = (data as { boxscore?: { players?: unknown[] } })?.boxscore
    ?.players;
  if (!Array.isArray(players)) return null;
  const out: LiveBox = {};
  for (const t of players as {
    statistics?: {
      name?: string;
      keys?: string[];
      athletes?: {
        athlete?: { displayName?: string; scratched?: boolean };
        stats?: string[];
        didNotPlay?: boolean;
      }[];
    }[];
  }[]) {
    for (const s of t.statistics || []) {
      if (sport === "nhl" && s.name === "goalies") continue;
      const at = (k: string) => s.keys?.indexOf(k) ?? -1;
      // NHL needs ice time too: the grader only counts a skater with time on ice as having played.
      const need =
        sport === "nba"
          ? ["points", "rebounds"]
          : ["goals", "assists", "timeOnIce"];
      if (need.some((k) => at(k) < 0)) continue;
      for (const a of s.athletes || []) {
        const name = a.athlete?.displayName;
        if (!name || a.didNotPlay || !a.stats?.length) continue;
        const st = a.stats;
        // Same participation rule as the NHL grader: a scratched skater or a zero-time row has not
        // shown he played, so his zeros are unknown, not results (left out: "live stats loading").
        if (
          sport === "nhl" &&
          (a.athlete?.scratched === true ||
            !(iceSeconds(st[at("timeOnIce")]) > 0))
        )
          continue;
        const line =
          sport === "nba"
            ? {
                points: count(st[at("points")]),
                rebounds: count(st[at("rebounds")]),
              }
            : {
                goals: count(st[at("goals")]),
                assists: count(st[at("assists")]),
              };
        if (Object.values(line).some((v) => v === null)) continue;
        out[playerKey(name)] =
          sport === "nba"
            ? { points: line.points!, rebounds: line.rebounds! }
            : {
                points: line.goals! + line.assists!,
                goals: line.goals!,
                assists: line.assists!,
              };
      }
    }
  }
  return out;
}

/** Whether ESPN's own summary says the game is over: only then can its box score be a final read. */
export function boxIsFinal(data: unknown) {
  const type = (
    data as {
      header?: {
        competitions?: { status?: { type?: { completed?: boolean } } }[];
      };
    }
  )?.header?.competitions?.[0]?.status?.type;
  return type?.completed === true;
}
