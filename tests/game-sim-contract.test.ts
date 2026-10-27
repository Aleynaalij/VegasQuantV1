import test from "node:test";
import assert from "node:assert/strict";
import demo from "../src/lib/game-sim/demo-run.json";
import {
  boxScore,
  parseSimRun,
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
