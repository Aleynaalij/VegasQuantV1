import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  canBuildWith,
  reusableSelections,
  legStatType,
  filterPublishedLegs,
  vqApprovedLeg,
  parlayCopy,
  parlayCopyLine,
  selectionError,
  weeklyLegs,
  type PublishedLeg,
} from "../src/lib/parlay-builder";
const now = new Date("2026-10-16T16:00:00Z");
const leg = (overrides: Partial<PublishedLeg> = {}): PublishedLeg => ({
  leg_key: "candidate:a:1",
  name: "Sample Player",
  market: "Full game · 40+ rushing yards",
  matchup: "Away @ Home · Sunday",
  game_id: "g",
  kind: "SINGLE",
  quote: "FanDuel -200",
  quote_observed_at: now.toISOString(),
  published_at: "2026-10-14T16:00:00Z",
  expires_at: "2026-10-18T17:00:00Z",
  result: null,
  why: "Role",
  risk: "Rotation",
  copy_text: "untrusted date game price",
  ...overrides,
});
test("Gambly text contains only player and stat, including official and bundled leaves", () => {
  assert.equal(parlayCopyLine(leg()), "Sample Player 40+ rushing yards");
  assert.equal(
    parlayCopyLine(
      leg({
        name: "Another Player Over 3.5 receptions",
        market: "Player Prop",
      }),
    ),
    "Another Player Over 3.5 receptions",
  );
  assert.equal(parlayCopyLine(leg({ market: "Moneyline" })), null);
  assert.equal(
    parlayCopy([
      leg(),
      leg({ name: "Other Player", market: "20+ receiving yards" }),
    ]),
    "Sample Player 40+ rushing yards\nOther Player 20+ receiving yards",
  );
  assert.equal(canBuildWith(leg({ kind: "PARLAY" }), +now), true);
});
test("Builder rejects conflicts across source types, stale legs, unsupported phases without a leg-count cap", () => {
  assert.match(
    selectionError(
      [leg()],
      leg({
        leg_key: "official:b",
        name: "Sample Player Over 50.5 rushing yards",
        market: "Player Prop",
      }),
      +now,
    )!,
    /one target/,
  );
  assert.equal(canBuildWith(leg({ result: "WIN" }), +now), false);
  assert.equal(
    canBuildWith(leg({ expires_at: now.toISOString() }), +now),
    false,
  );
  assert.equal(
    canBuildWith(leg({ market: "Halftime · 40+ rushing yards" }), +now),
    false,
  );
  const chosen = Array.from({ length: 40 }, (_, i) =>
    leg({ leg_key: `leg:${i}`, name: `Player ${i}` }),
  );
  assert.equal(selectionError(chosen, leg(), +now), null);
  assert.equal(
    selectionError(
      [...chosen, leg()],
      leg({ leg_key: "another", name: "Another Player" }),
      +now,
    ),
    null,
  );
});
test("Weekly catalogue includes bundle leaves and dedupes newest observation without reviving older duplicates", () => {
  const newest = leg({
    leg_key: "b",
    published_at: "2026-10-15T12:00:00Z",
    result: "WIN",
  });
  assert.deepEqual(
    weeklyLegs(
      [
        leg(),
        newest,
        leg({ name: "Old", published_at: "2026-10-10T12:00:00Z" }),
        leg({ market: "Whole parlay" }),
      ],
      now,
    ),
    [newest],
  );
});
test(
  "Private parlay ownership, server snapshots and trusted recommendations",
  { timeout: 30000 },
  async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      "tests/sql/member-parlays.mjs",
    ]);
    assert.match(stdout, /Member parlay transaction verified/);
  },
);

test("Stat filters include legacy player props; approval and search combine without relabeling legs", () => {
  const passing = leg({
    leg_key: "pass",
    market: "Full game · 200+ passing yards",
  });
  const receiving = leg({ leg_key: "rec", market: "40+ receiving yards" });
  const catches = leg({ leg_key: "catches", market: "3+ catches" });
  const legacy = leg({
    leg_key: "legacy",
    name: "Another Player Over 40.5 passing yards",
    market: "Player Prop",
  });
  const all = [passing, receiving, catches, legacy];
  assert.equal(legStatType(legacy), "passing");
  assert.equal(legStatType(catches), "receptions");
  assert.deepEqual(filterPublishedLegs(all, "passing", "", false, new Set()), [
    passing,
    legacy,
  ]);
  assert.deepEqual(
    filterPublishedLegs(all, "passing", "another", true, new Set(["legacy"])),
    [legacy],
  );
  assert.deepEqual(
    filterPublishedLegs(all, "receiving", "", true, new Set(["legacy"])),
    [],
  );
  const form = { cleared: 5, sample: 5, median: 80, position: "RB" };
  assert.equal(vqApprovedLeg(leg({ odds: -200 }), form, -200), true);
  assert.equal(
    vqApprovedLeg(leg({ odds: -200, result: "WIN" }), form, -200),
    false,
  );
  assert.equal(vqApprovedLeg(leg({ odds: -200 }), undefined, -200), false);
  assert.equal(vqApprovedLeg(leg({ odds: -200 }), form, -180), false);
});

test("reuse keeps saved history intact and uses open current catalog selections only", () => {
  const original = [
    leg(),
    leg({ leg_key: "closed", name: "Closed Player" }),
    leg({ leg_key: "missing" }),
  ];
  const current = leg({ quote: "FanDuel -180" });
  const reused = reusableSelections(
    original.map((l) => l.leg_key),
    [current, leg({ leg_key: "closed", result: "WIN" })],
    +now,
  );
  assert.deepEqual(reused.legs, [current]);
  assert.equal(reused.skipped, 2);
  assert.equal(original[0].quote, "FanDuel -200");
  assert.equal(original.length, 3);
  assert.equal(
    reusableSelections([current.leg_key, current.leg_key], [current], +now).legs
      .length,
    1,
  );
});
