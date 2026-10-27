import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { parseResearchRun } from "../src/lib/game-sim/research";
const fixture = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        "research/game_sim/artifacts/v0.1.1/research-render.json.gz",
      ),
    ).toString(),
  );
test("actual engine artifact parses without pretending to be a current game", () => {
  const r = parseResearchRun(fixture());
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  if (!r.ok) return;
  assert.equal(r.run.runs.actual, 10000);
  assert.equal(r.run.mode, "scenario");
  assert.equal(r.run.game.kickoff, null);
  assert.equal(r.run.game.teams.home.name, "League baseline A");
  assert.ok(r.run.events.length > 100);
});
test("rejects mismatched counts, incomplete runs, live-game substitution and corrupt sequences", () => {
  for (const mutate of [
    (r: any) => (r.is_current_matchup = true),
    (r: any) => (r.runs.failed = 1),
    (r: any) => r.ensemble.total.bins[0].count++,
    (r: any) => (r.events[1].sequence = 99),
    (r: any) => (r.events[0].score_after.home = 100),
    (r: any) => (r.ensemble.total.bins = [null]),
  ]) {
    const r = fixture();
    mutate(r);
    assert.equal(parseResearchRun(r).ok, false);
  }
});
