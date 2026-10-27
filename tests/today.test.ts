import test from "node:test";
import assert from "node:assert/strict";
import { kickoffWindow, legMarket, legMatchup, todayWindows, type TodayRelease } from "../src/lib/today";

const leg = (name: string, extra = {}) => ({ name, market: "Full game · 50+ rushing yards", matchup: "Buffalo @ Los Angeles Rams · Oct 12 · 8:15 PM ET", ...extra });
const release = (id: string, expires_at: string, candidates = [leg(id)]): TodayRelease => ({ id, title: id, candidates, created_at: "2026-10-11T10:00:00Z", expires_at });

test("kickoff windows use Eastern time", () => {
  assert.equal(kickoffWindow("2026-10-11T17:00:00Z").label, "Sun · Early games"); // 1:00 PM EDT
  assert.equal(kickoffWindow("2026-10-11T20:25:00Z").label, "Sun · Late afternoon"); // 4:25 PM EDT
  assert.equal(kickoffWindow("2026-10-12T00:20:00Z").label, "Sun · Night game"); // 8:20 PM EDT Sunday
  assert.equal(kickoffWindow("2026-11-08T18:00:00Z").label, "Sun · Early games"); // 1:00 PM EST
});

test("Today groups live releases by window and drops recaps, Hail Mary and Pick of the Day", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  const w = todayWindows([
    release("night", "2026-10-12T00:20:00Z"),
    release("early", "2026-10-11T17:00:00Z"),
    release("early2", "2026-10-11T17:00:00Z"),
    release("expired", "2026-10-11T14:00:00Z"),
    release("pod", "2026-10-11T17:00:00Z", [leg("p", { pick_of_day: true })]),
    release("fun", "2026-10-11T17:00:00Z", [leg("f", { fun_play: true })]),
    release("recap", "2026-10-11T17:00:00Z", [leg("r", { analysis_kind: "RETROSPECTIVE_OWNER_TICKET" })]),
  ], now);
  assert.deepEqual(w.map((x) => [x.label, x.releases.map((r) => r.id)]), [
    ["Sun · Early games", ["early", "early2"]],
    ["Sun · Night game", ["night"]],
  ]);
});

test("leg text helpers shorten market and matchup", () => {
  assert.equal(legMarket("Full game · 60+ receiving yards"), "60+ receiving yards");
  assert.equal(legMarket("FULL GAME TOTAL · 50+ rushing yards"), "50+ rushing yards");
  assert.equal(legMatchup("Buffalo @ Los Angeles Rams · Oct 12 · 8:15 PM ET"), "Buffalo @ Los Angeles Rams");
});

test("Today drops a release once a price revision supersedes it", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  const w = todayWindows([
    release("old", "2026-10-11T17:00:00Z"),
    release("new", "2026-10-11T17:00:00Z", [leg("n", { supersedes_release_id: "old" })]),
  ], now);
  assert.deepEqual(w.flatMap((x) => x.releases.map((r) => r.id)), ["new"]);
});

test("Today lists individual targets without counting their parlay bundle as a leg", () => {
  const w = todayWindows([release("ticket", "2026-10-16T00:15:00Z", [
    leg("Six-leg parlay", { parlay: true }),
    leg("JSN"),
    leg("Wilson"),
  ])], Date.parse("2026-10-14T18:00:00Z"));
  assert.deepEqual(w[0].releases[0].candidates.map(c => c.name), ["JSN", "Wilson"]);
});
