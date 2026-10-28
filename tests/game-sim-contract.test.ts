import test from "node:test";
import assert from "node:assert/strict";
import demo from "../src/lib/game-sim/demo-run.json";
import {
  boxScore,
  initials,
  parseSimRun,
  shortName,
  statLine,
  playText,
  situationText,
} from "../src/lib/game-sim/contract";

const clone = () => JSON.parse(JSON.stringify(demo));

test("The DEMO fixture is a valid, explicitly synthetic simulator run", () => {
  const r = parseSimRun(demo);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  const run = r.run;
  assert.equal(run.mode, "demo");
  assert.equal(run.is_demo, true);
  assert.equal(run.distributions, null, "the demo carries no probabilities");
  assert.equal(run.runs.actual, 0);
  for (const t of Object.values(run.game.teams)) assert.match(t.name, /^Demo /);
  for (const e of run.events)
    for (const p of e.participants) assert.match(p.name, /^Demo /);
  const last = run.events.at(-1)!;
  assert.equal(last.play_type, "end_period");
  assert.equal(last.clock_after_s, 0);
  // Every score change is a touchdown, kick or safety on that play.
  for (const e of run.events) {
    const pts =
      e.score_after.home +
      e.score_after.away -
      e.score_before.home -
      e.score_before.away;
    if (!pts) continue;
    assert.ok(
      (e.touchdown && pts === 6) ||
        (e.play_type === "field_goal" && e.made && pts === 3) ||
        (e.play_type === "extra_point" && e.made && pts === 1),
      `event ${e.sequence} scores ${pts}`,
    );
  }
});

test("The contract rejects runs the renderer could misdraw", () => {
  const backwards = clone();
  backwards.events[5].clock_before_s = 899;
  assert.match(
    (parseSimRun(backwards) as { errors: string[] }).errors.join(),
    /clock jumps back/,
  );
  const scores = clone();
  scores.events[20].score_before.home += 3;
  assert.match(
    (parseSimRun(scores) as { errors: string[] }).errors.join(),
    /score_before/,
  );
  const unlabeled = clone();
  unlabeled.is_demo = false;
  assert.match(
    (parseSimRun(unlabeled) as { errors: string[] }).errors.join(),
    /is_demo/,
  );
  const unknownPlay = clone();
  unknownPlay.events[3].play_type = "hail_mary";
  assert.equal(parseSimRun(unknownPlay).ok, false);
  const offField = clone();
  offField.events[3].ball_end_x = 104;
  assert.equal(parseSimRun(offField).ok, false);
});

test("Box score and play text come only from the events", () => {
  const r = parseSimRun(demo);
  assert.ok(r.ok);
  if (!r.ok) return;
  const box = boxScore(r.run);
  for (const side of ["home", "away"] as const) {
    const players = box.players.filter((p) => p.team === side);
    const passing = players.reduce((a, p) => a + p.passing.yds, 0);
    const receiving = players.reduce((a, p) => a + p.receiving.yds, 0);
    const completions = players.reduce((a, p) => a + p.passing.comp, 0);
    const receptions = players.reduce((a, p) => a + p.receiving.rec, 0);
    assert.equal(passing, receiving, `${side} passing = receiving yards`);
    assert.equal(completions, receptions);
    const scrimmageYards: number = r.run.events
      .filter(
        (e) =>
          e.possession === side &&
          [
            "run",
            "pass_complete",
            "pass_incomplete",
            "sack",
            "fumble_lost",
            "kneel",
          ].includes(e.play_type),
      )
      .reduce((a, e) => a + e.yards, 0);
    assert.equal(box.team[side].yards, scrimmageYards);
  }
  const first = r.run.events[1];
  assert.equal(situationText(r.run, first), "1st & 10 at VQB 25");
  assert.match(playText(r.run, first), /^Demo RB Bandit run, 4 yds$/);
  const td = r.run.events.find((e) => e.touchdown)!;
  assert.match(playText(r.run, td), /TOUCHDOWN$/);
  assert.equal(
    situationText(r.run, r.run.events[0]),
    null,
    "kickoffs have no down",
  );
});

test("Runs with no plays never reach the renderer, and kneel-downs count as QB carries", () => {
  const empty = clone();
  empty.events = [];
  assert.match(
    (parseSimRun(empty) as { errors: string[] }).errors.join(),
    /run has no events/,
  );
  empty.status = "blocked";
  empty.blockers = ["no play-by-play source"];
  assert.match(
    (parseSimRun(empty) as { errors: string[] }).errors.join(),
    /run blocked: no play-by-play source/,
  );
  const r = parseSimRun(demo);
  assert.ok(r.ok);
  if (!r.ok) return;
  const box = boxScore(r.run);
  const kneels = r.run.events.filter((e) => e.play_type === "kneel");
  assert.equal(kneels.length, 2);
  const qb = box.players.find((p) => p.player_id === "vqb-qb")!;
  assert.equal(qb.rushing.att, 2);
  assert.equal(qb.rushing.yds, -2);
  assert.deepEqual(box.team.away, { plays: 36, yards: 243, turnovers: 1 });
});

test("The engine's own fixture format converts to home-relative field positions", async () => {
  // Snapshot of research/game_sim/demo.json from Codex's #133 (c7b1b98).
  const engine = (
    await import("./fixtures/game-sim-engine-demo.json", {
      with: { type: "json" },
    })
  ).default;
  const r = parseSimRun(engine);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  assert.equal(r.run.mode, "demo");
  assert.equal(r.run.distributions, null);
  assert.equal(r.run.replay.seed, null);
  const [first] = r.run.events;
  assert.equal(first.ball_start_x, 25);
  assert.equal(situationText(r.run, first), "1st & 10 at VQA 25");
  const xp = r.run.events.find((e) => e.play_type === "extra_point")!;
  assert.equal(xp.down, null, "kicks have no down");
  assert.equal(xp.made, true);
  const run = r.run.events.find((e) => e.play_type === "run")!;
  assert.equal(run.made, null, "made applies only to kicks");
  assert.equal(r.run.events.at(-1)!.score_after.home, 7);
  // Teams switching ends: the same plays with home defending the right goal land on the same
  // home-relative spots.
  const flipped = JSON.parse(JSON.stringify(engine));
  for (const e of flipped.replay.events) {
    for (const s of [e.before, e.after]) s.home_defends = "right";
    for (const k of ["ball_start_x", "ball_end_x"])
      if (e[k] != null) e[k] = 100 - e[k];
  }
  const f = parseSimRun(flipped);
  assert.ok(f.ok);
  if (!f.ok) return;
  assert.deepEqual(
    f.run.events.map((e) => [e.ball_start_x, e.ball_end_x]),
    r.run.events.map((e) => [e.ball_start_x, e.ball_end_x]),
  );
  // A malformed engine file is rejected with the engine's field path.
  const broken = JSON.parse(JSON.stringify(engine));
  broken.replay.events[2].before.home_defends = "north";
  const b = parseSimRun(broken) as { ok: false; errors: string[] };
  assert.equal(b.ok, false);
  assert.match(b.errors.join(), /replay\.events\.2\.before\.home_defends/);
  // Real-game engine payloads are refused until their game and provenance map, never shown as
  // complete runs.
  for (const mode of ["pregame", "scenario", "historical_replay"]) {
    const real = JSON.parse(JSON.stringify(engine));
    real.mode = mode;
    real.is_demo = false;
    const rejected = parseSimRun(real) as { ok: false; errors: string[] };
    assert.equal(rejected.ok, false, mode);
    assert.match(
      rejected.errors.join(),
      new RegExp(`engine ${mode} runs aren't supported`),
    );
  }
  const unlabeled = JSON.parse(JSON.stringify(engine));
  unlabeled.is_demo = false;
  assert.equal(
    parseSimRun(unlabeled).ok,
    false,
    "a demo must stay labeled demo",
  );
  // The corrected fixture credits passers and has no downs on kicks.
  const box = boxScore(r.run);
  const passing = box.players.reduce((a, p) => a + p.passing.yds, 0);
  const receiving = box.players.reduce((a, p) => a + p.receiving.yds, 0);
  assert.ok(passing > 0);
  assert.equal(passing, receiving);
  const kickoff = r.run.events.find((e) => e.play_type === "kickoff")!;
  assert.equal(kickoff.down, null);
  assert.equal(kickoff.ball_start_x, 35);
});

test("Player cards show stats as of the play on screen", () => {
  const r = parseSimRun(demo);
  assert.ok(r.ok);
  if (!r.ok) return;
  const events = r.run.events;
  const i = events.findIndex((e) => e.play_type === "pass_complete");
  assert.ok(i > 0, "the demo has a completed pass");
  const passer = events[i].participants.find((p) => p.role === "passer")!;
  const before = boxScore(r.run, i - 1).players.find(
    (p) => p.player_id === passer.player_id,
  );
  const after = boxScore(r.run, i).players.find(
    (p) => p.player_id === passer.player_id,
  )!;
  assert.equal(after.passing.comp, (before?.passing.comp ?? 0) + 1);
  assert.equal(after.passing.yds, (before?.passing.yds ?? 0) + events[i].yards);
  assert.deepEqual(boxScore(r.run, events.length - 1), boxScore(r.run));
  assert.equal(boxScore(r.run, -1).players.length, 0);
});

test("Stat lines follow the player's role on the play", () => {
  const line = {
    player_id: "p",
    name: "Dak Prescott",
    team: "home" as const,
    passing: { comp: 8, att: 9, yds: 93, td: 1, int: 0 },
    rushing: { att: 2, yds: 7, td: 0 },
    receiving: { rec: 0, yds: 0, td: 0 },
  };
  assert.equal(statLine(line, "passer"), "8/9 93 YDS 1 TD");
  assert.equal(statLine(line, "rusher"), "2 CAR 7 YDS");
  assert.equal(statLine(line, "target"), "");
  assert.equal(statLine(undefined, "passer"), "");
  assert.equal(shortName("Dak Prescott"), "D. Prescott");
  assert.equal(shortName("Amon-Ra St. Brown"), "A. St. Brown");
  assert.equal(shortName("Kenneth Walker III"), "K. Walker");
  assert.equal(shortName("Prescott"), "Prescott");
  assert.equal(initials("Dak Prescott"), "DP");
  assert.equal(initials("Prescott"), "P");
});
