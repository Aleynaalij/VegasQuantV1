import { z } from "zod";

// Simulator output contract, v0 as proposed in #132. The UI reads simulator runs only through
// parseSimRun, so a contract change from the engine touches this file alone. Field positions are
// absolute: ball_*_x runs 0–100 from the home team's goal line, so the renderer never infers
// direction across quarters or overtime.

export const PLAY_TYPES = [
  "run",
  "pass_complete",
  "pass_incomplete",
  "sack",
  "interception",
  "fumble_lost",
  "kickoff",
  "punt",
  "field_goal",
  "extra_point",
  "two_point",
  "penalty",
  "kneel",
  "spike",
  "timeout",
  "end_period",
] as const;

const side = z.enum(["home", "away"]);
const score = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});
const team = z.object({
  id: z.string().min(1),
  abbr: z.string().min(1).max(5),
  name: z.string().min(1),
});
const quantiles = z.object({
  p5: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p95: z.number(),
});
const distribution = z.object({
  n: z.number().int().positive(),
  mean: z.number(),
  quantiles,
  bins: z
    .array(
      z.object({
        lo: z.number(),
        hi: z.number(),
        count: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const simEvent = z.object({
  sequence: z.number().int().min(0),
  period: z.number().int().min(1),
  clock_before_s: z.number().int().min(0).max(900),
  clock_after_s: z.number().int().min(0).max(900),
  possession: side,
  down: z.number().int().min(1).max(4).nullable(),
  distance: z.number().int().min(0).nullable(),
  yardline_100: z.number().min(0).max(100).nullable(),
  ball_start_x: z.number().min(0).max(100).nullable(),
  ball_end_x: z.number().min(0).max(100).nullable(),
  play_type: z.enum(PLAY_TYPES),
  yards: z.number().int(),
  first_down: z.boolean().default(false),
  touchdown: z.boolean().default(false),
  turnover: z.boolean().default(false),
  safety: z.boolean().default(false),
  made: z.boolean().nullable().default(null),
  penalty_on: side.nullable().default(null),
  participants: z
    .array(
      z.object({
        role: z.enum(["passer", "rusher", "target", "kicker", "returner"]),
        player_id: z.string().min(1),
        name: z.string().min(1),
        team: side,
      }),
    )
    .default([]),
  score_before: score,
  score_after: score,
  text: z.string().optional(),
});

export const simRun = z.object({
  schema_version: z.literal("0"),
  run_id: z.string().min(1),
  mode: z.enum(["demo", "historical_replay", "pregame", "scenario"]),
  is_demo: z.boolean(),
  status: z.enum(["complete", "blocked"]),
  blockers: z.array(z.string()).default([]),
  game: z.object({
    game_id: z.string().min(1),
    kickoff: z.string().min(1),
    teams: z.object({ home: team, away: team }),
  }),
  model_version: z.string().min(1),
  artifact_hash: z.string().min(1),
  generation_time: z.string().min(1),
  historical_cutoff: z.string().nullable(),
  runs: z.object({
    requested: z.number().int().min(0),
    actual: z.number().int().min(0),
  }),
  replay: z.object({
    seed: z.union([z.string(), z.number()]),
    selection: z.object({
      method: z.string().min(1),
      description: z.string().min(1),
      distance: z.number().nullable(),
    }),
  }),
  distributions: z
    .object({
      home_score: distribution,
      away_score: distribution,
      margin: distribution,
      total: distribution,
      home_win: z.object({
        count: z.number().int().min(0),
        n: z.number().int().positive(),
      }),
      players: z
        .array(
          z.object({
            player_id: z.string().min(1),
            name: z.string().min(1),
            team: side,
            stat: z.string().min(1),
            supported: z.boolean(),
            unsupported_reason: z.string().nullable().default(null),
            quantiles: quantiles.nullable().default(null),
            n: z.number().int().min(0).nullable().default(null),
          }),
        )
        .default([]),
    })
    .nullable(),
  scenario: z
    .object({
      id: z.string().min(1),
      label: z.string().min(1),
      adjustments: z.array(z.string()),
    })
    .nullable()
    .default(null),
  events: z.array(simEvent),
});

export type SimEvent = z.infer<typeof simEvent>;
export type SimRun = z.infer<typeof simRun>;
export type Side = "home" | "away";

/** A run the UI can show, or the reasons it can't. Never repairs or invents missing fields. */
export function parseSimRun(
  input: unknown,
): { ok: true; run: SimRun } | { ok: false; errors: string[] } {
  const parsed = simRun.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "run"}: ${i.message}`,
      ),
    };
  const errors = runErrors(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, run: parsed.data };
}

/** Event-stream invariants the renderer relies on. */
export function runErrors(run: SimRun): string[] {
  const errors: string[] = [];
  // The renderer plays events; a run without any (e.g. a blocked run) has nothing to show.
  if (!run.events.length)
    errors.push(
      run.status === "blocked"
        ? `run blocked: ${run.blockers.join("; ") || "no reason given"}`
        : "run has no events",
    );
  if (run.mode === "demo" ? !run.is_demo : run.is_demo)
    errors.push("is_demo must be true exactly for demo runs");
  if ((run.mode === "scenario") !== !!run.scenario)
    errors.push("scenario must be present exactly for scenario runs");
  run.events.forEach((e, i) => {
    const prev = run.events[i - 1];
    if (e.sequence !== i) errors.push(`event ${i}: sequence ${e.sequence}`);
    if (e.clock_after_s > e.clock_before_s)
      errors.push(`event ${i}: clock runs backwards`);
    if (prev) {
      if (e.period < prev.period) errors.push(`event ${i}: period goes back`);
      if (e.period === prev.period && e.clock_before_s > prev.clock_after_s)
        errors.push(`event ${i}: clock jumps back`);
      if (
        e.score_before.home !== prev.score_after.home ||
        e.score_before.away !== prev.score_after.away
      )
        errors.push(
          `event ${i}: score_before differs from previous score_after`,
        );
    }
    if (
      e.score_after.home < e.score_before.home ||
      e.score_after.away < e.score_before.away
    )
      errors.push(`event ${i}: score decreases`);
  });
  return errors;
}

export const clockText = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const periodText = (p: number) =>
  p <= 4 ? `Q${p}` : p === 5 ? "OT" : `OT${p - 4}`;
const ordinal = ["1st", "2nd", "3rd", "4th"];

/** "3rd & 4 at VQB 32" from the offense's view, or null for untimed/no-down plays. */
export function situationText(run: SimRun, e: SimEvent) {
  if (e.down == null || e.distance == null || e.ball_start_x == null)
    return null;
  const { home, away } = run.game.teams;
  const x = e.ball_start_x;
  const spot =
    x === 50
      ? "50"
      : x < 50
        ? `${home.abbr} ${Math.round(x)}`
        : `${away.abbr} ${Math.round(100 - x)}`;
  const yardsToGoal = e.yardline_100 ?? null;
  const dist =
    yardsToGoal != null && e.distance >= yardsToGoal ? "Goal" : e.distance;
  return `${ordinal[e.down - 1]} & ${dist} at ${spot}`;
}

const who = (e: SimEvent, role: string) =>
  e.participants.find((p) => p.role === role)?.name;
const gain = (y: number) =>
  y === 0
    ? "no gain"
    : y > 0
      ? `${y} yd${y === 1 ? "" : "s"}`
      : `loss of ${-y}`;

/** One play written from its fields, so wording always matches the data. */
export function playText(run: SimRun, e: SimEvent) {
  const t = run.game.teams;
  const offense = t[e.possession].abbr;
  const passer = who(e, "passer"),
    rusher = who(e, "rusher"),
    target = who(e, "target"),
    kicker = who(e, "kicker"),
    returner = who(e, "returner");
  const td = e.touchdown ? " · TOUCHDOWN" : "";
  const fd = e.first_down && !e.touchdown ? " · first down" : "";
  switch (e.play_type) {
    case "run":
      return `${rusher ?? offense} run, ${gain(e.yards)}${td}${fd}`;
    case "pass_complete":
      return `${passer ?? offense} pass to ${target ?? "receiver"}, ${gain(e.yards)}${td}${fd}`;
    case "pass_incomplete":
      return `${passer ?? offense} pass incomplete${target ? ` for ${target}` : ""}`;
    case "sack":
      return `${passer ?? offense} sacked, ${gain(e.yards)}${e.safety ? " · SAFETY" : ""}`;
    case "interception":
      return `${passer ?? offense} intercepted${td ? " · returned for TOUCHDOWN" : ""}`;
    case "fumble_lost":
      return `${rusher ?? target ?? offense} fumbles · lost${td ? " · returned for TOUCHDOWN" : ""}`;
    case "kickoff":
      return `${kicker ?? offense} kickoff${returner ? `, returned by ${returner}` : ""}${td}`;
    case "punt":
      return `${kicker ?? offense} punts${returner ? `, returned by ${returner}` : ""}${td}`;
    case "field_goal":
      return `${kicker ?? offense} ${Math.round((e.yardline_100 ?? 0) + 17)}-yd field goal ${e.made ? "GOOD" : "no good"}`;
    case "extra_point":
      return `${kicker ?? offense} extra point ${e.made ? "good" : "no good"}`;
    case "two_point":
      return `Two-point try ${e.made ? "good" : "fails"}`;
    case "penalty":
      return `Penalty on ${e.penalty_on ? t[e.penalty_on].abbr : "?"}, ${Math.abs(e.yards)} yds`;
    case "kneel":
      return `${passer ?? offense} kneels`;
    case "spike":
      return `${passer ?? offense} spikes the ball`;
    case "timeout":
      return `Timeout · ${offense}`;
    case "end_period":
      return `End of ${periodText(e.period)}`;
  }
}

export type BoxLine = {
  player_id: string;
  name: string;
  team: Side;
  passing: { comp: number; att: number; yds: number; td: number; int: number };
  rushing: { att: number; yds: number; td: number };
  receiving: { rec: number; yds: number; td: number };
};

/** Box score derived only from events: every stat traces to a play. */
export function boxScore(run: SimRun) {
  const lines = new Map<string, BoxLine>();
  const line = (p: { player_id: string; name: string; team: Side }) => {
    let l = lines.get(p.player_id);
    if (!l) {
      l = {
        ...p,
        passing: { comp: 0, att: 0, yds: 0, td: 0, int: 0 },
        rushing: { att: 0, yds: 0, td: 0 },
        receiving: { rec: 0, yds: 0, td: 0 },
      };
      lines.set(p.player_id, l);
    }
    return l;
  };
  const team = {
    home: { plays: 0, yards: 0, turnovers: 0 },
    away: { plays: 0, yards: 0, turnovers: 0 },
  };
  for (const e of run.events) {
    const passer = e.participants.find((p) => p.role === "passer");
    const rusher = e.participants.find((p) => p.role === "rusher");
    const target = e.participants.find((p) => p.role === "target");
    const scrimmage = [
      "run",
      "pass_complete",
      "pass_incomplete",
      "sack",
      "interception",
      "fumble_lost",
      "kneel",
    ].includes(e.play_type);
    if (scrimmage) {
      team[e.possession].plays++;
      if (e.play_type !== "interception") team[e.possession].yards += e.yards;
    }
    if (e.turnover) team[e.possession].turnovers++;
    // A kneel-down is a quarterback rushing attempt, as in official box scores.
    const carrier = e.play_type === "kneel" ? (rusher ?? passer) : rusher;
    if ((e.play_type === "run" || e.play_type === "kneel") && carrier) {
      const l = line(carrier);
      l.rushing.att++;
      l.rushing.yds += e.yards;
      if (e.touchdown) l.rushing.td++;
    }
    if (
      ["pass_complete", "pass_incomplete", "interception"].includes(
        e.play_type,
      ) &&
      passer
    ) {
      const l = line(passer);
      l.passing.att++;
      if (e.play_type === "pass_complete") {
        l.passing.comp++;
        l.passing.yds += e.yards;
        if (e.touchdown) l.passing.td++;
      }
      if (e.play_type === "interception") l.passing.int++;
    }
    if (e.play_type === "pass_complete" && target) {
      const l = line(target);
      l.receiving.rec++;
      l.receiving.yds += e.yards;
      if (e.touchdown) l.receiving.td++;
    }
  }
  return { team, players: [...lines.values()] };
}
