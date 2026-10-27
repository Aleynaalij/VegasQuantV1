import { z } from "zod";
import { parseSimRun, type SimRun } from "./contract";
const score = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});
const rawEvent = z.object({
  sequence: z.number().int().nonnegative(),
  period_before: z.number().int().min(1).max(5),
  period_after: z.number().int().min(1).max(5),
  clock_before_s: z.number().int().min(0).max(900),
  clock_after_s: z.number().int().min(0).max(900),
  possession: z.enum(["home", "away"]),
  down: z.number().int().min(1).max(4).nullable(),
  distance: z.number().int().nonnegative().nullable(),
  yardline_100: z.number().min(0).max(100),
  ball_start_x: z.number().min(0).max(100),
  ball_end_x: z.number().min(0).max(100),
  play_type: z.string(),
  yards: z.number().int(),
  score_before: score,
  score_after: score,
  before: z.object({ phase: z.string() }),
  after: z.object({ phase: z.string() }),
  participants: z.array(z.unknown()).default([]),
});
const dist = z.object({
  n: z.number().int().positive(),
  mean: z.number(),
  quantiles: z.record(z.string(), z.number()),
  bins: z
    .array(
      z.object({
        lo: z.number(),
        hi: z.number(),
        count: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
const outcome = z.object({
  count: z.number().int().nonnegative(),
  n: z.number().int().positive(),
});
const envelope = z.object({
  schema_version: z.literal("vq-game-research-render/0.2"),
  mode: z.literal("research_baseline"),
  is_current_matchup: z.literal(false),
  title: z.string(),
  generated_at: z.string().datetime({ offset: true }),
  model_id: z.literal("vq-empirical-game/0.1.1"),
  artifact_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  input_hash: z.string().regex(/^[0-9a-f]{64}$/),
  runs: z.object({
    requested: z.number().int().positive(),
    actual: z.number().int().positive(),
    failed: z.literal(0),
  }),
  blockers: z.array(z.string()).min(1),
  events: z.array(rawEvent).min(1),
  ensemble: z.object({
    home_score: dist,
    away_score: dist,
    margin: dist,
    total: dist,
    home_win: outcome,
    away_win: outcome,
    tie: outcome,
  }),
  replay: z.object({
    method: z.string(),
    description: z.string(),
    distance: z.number(),
  }),
  players: z.array(z.unknown()).length(0),
});

/** Accept only this archived league research artifact; never a caller-supplied matchup. */
export function parseResearchRun(
  input: unknown,
): { ok: true; run: SimRun; title: string } | { ok: false; errors: string[] } {
  const parsed = envelope.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  const r = parsed.data;
  const errors: string[] = [];
  if (r.runs.actual !== r.runs.requested) errors.push("Incomplete ensemble");
  let prior: z.infer<typeof rawEvent> | undefined;
  for (const [i, e] of r.events.entries()) {
    if (e.sequence !== i) errors.push(`event ${i}: source sequence`);
    if (
      e.period_after < e.period_before ||
      e.period_after > e.period_before + 1
    )
      errors.push(`event ${i}: period transition`);
    if (
      e.period_after === e.period_before &&
      e.clock_after_s > e.clock_before_s
    )
      errors.push(`event ${i}: clock increased`);
    if (
      prior &&
      (e.score_before.home !== prior.score_after.home ||
        e.score_before.away !== prior.score_after.away)
    )
      errors.push(`event ${i}: source score discontinuity`);
    prior = e;
  }
  if (prior?.after.phase !== "final") errors.push("Replay is not complete");
  for (const key of ["home_score", "away_score", "margin", "total"] as const) {
    const d = r.ensemble[key] as {
      n?: unknown;
      bins?: { count: number }[];
      quantiles?: Record<string, number>;
    };
    if (
      !d ||
      d.n !== r.runs.actual ||
      !Array.isArray(d.bins) ||
      d.bins.some((b) => !Number.isInteger(b.count) || b.count < 0) ||
      d.bins.reduce((n, b) => n + b.count, 0) !== r.runs.actual
    )
      errors.push(`${key}: inconsistent sample counts`);
    const q = d?.quantiles;
    if (
      !q ||
      ![q.p5, q.p25, q.p50, q.p75, q.p95].every(Number.isFinite) ||
      ![q.p5 <= q.p25, q.p25 <= q.p50, q.p50 <= q.p75, q.p75 <= q.p95].every(
        Boolean,
      )
    )
      errors.push(`${key}: unordered quantiles`);
  }
  const outcomes = (["home_win", "away_win", "tie"] as const).map(
    (k) => r.ensemble[k] as { count: number; n: number },
  );
  if (
    outcomes.some(
      (o) =>
        !o ||
        o.n !== r.runs.actual ||
        !Number.isInteger(o.count) ||
        o.count < 0,
    ) ||
    outcomes.reduce((n, o) => n + (o?.count || 0), 0) !== r.runs.actual
  )
    errors.push("Outcome counts do not reconcile");
  if (errors.length) return { ok: false, errors };
  const events = r.events
    .filter((e) => !["end_period", "start_overtime"].includes(e.play_type))
    .map((e, i) => {
      const home = e.score_after.home - e.score_before.home,
        away = e.score_after.away - e.score_before.away;
      return {
        sequence: i,
        period: e.period_before,
        clock_before_s: e.clock_before_s,
        clock_after_s: e.clock_after_s,
        possession: e.possession,
        down: e.down,
        distance: e.distance,
        yardline_100: e.yardline_100,
        ball_start_x: e.ball_start_x,
        ball_end_x: e.ball_end_x,
        play_type: e.play_type,
        yards: e.yards,
        score_before: e.score_before,
        score_after: e.score_after,
        participants: [],
        first_down:
          e.after.phase === "scrimmage" &&
          e.down !== null &&
          e.play_type !== "penalty" &&
          e.yards >= (e.distance ?? Infinity),
        touchdown: home === 6 || away === 6,
        turnover: [
          "interception",
          "fumble_lost",
          "defensive_touchdown",
        ].includes(e.play_type),
        safety: home === 2 || away === 2,
        made: ["extra_point", "two_point", "field_goal"].includes(e.play_type)
          ? home > 0 || away > 0
          : null,
        penalty_on:
          e.play_type === "penalty"
            ? e.yards < 0
              ? e.possession
              : e.possession === "home"
                ? "away"
                : "home"
            : null,
      };
    });
  // These are synthetic league-side labels, NOT real teams or an authoritative game ID.
  const adapted = parseSimRun({
    schema_version: "0",
    run_id: `research:${r.input_hash}`,
    mode: "scenario",
    is_demo: false,
    status: "complete",
    blockers: r.blockers,
    game: {
      game_id: `research:${r.input_hash}`,
      kickoff: null,
      teams: {
        home: { id: "baseline-home", abbr: "BASEA", name: "League baseline A" },
        away: { id: "baseline-away", abbr: "BASEB", name: "League baseline B" },
      },
    },
    model_version: r.model_id,
    artifact_hash: r.artifact_sha256,
    generation_time: r.generated_at,
    historical_cutoff: null,
    runs: r.runs,
    replay: { seed: null, selection: r.replay },
    distributions: { ...r.ensemble, players: [] },
    scenario: {
      id: "league-baseline-2022",
      label: "Historical league baseline · not a current matchup forecast",
      adjustments: [
        "Empirical 2022 play distribution",
        "Uncalibrated; total-score diagnostics worse than historical baseline",
        "Player forecasts unavailable",
      ],
    },
    events,
  });
  return adapted.ok ? { ok: true, run: adapted.run, title: r.title } : adapted;
}
