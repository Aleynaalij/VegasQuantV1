import { test } from "node:test";
import assert from "node:assert/strict";
import { breakEven, checkLeg, formLine, stamped, verdict } from "../src/lib/leg-rules";

const status = (c: ReturnType<typeof checkLeg>, id: string) => c.find((x) => x.id === id)?.status;

test("Engram 2026-10-15: 3 of 5 at -240 fails R1, tight-end yardage fails R5, the drift fails R7", () => {
  const c = checkLeg({
    price: -240,
    lastPrice: -220,
    form: { cleared: 3, sample: 5, median: 16, position: "TE" },
    market: "Full game · 15+ receiving yards",
  });
  assert.equal(status(c, "R1"), "fail");
  assert.equal(status(c, "R2"), "pass");
  assert.equal(status(c, "R5"), "fail");
  assert.equal(status(c, "R7"), "fail");
  assert.equal(verdict(c), "fail");
});

test("a -200 leg cleared 5 of 5 with a steady price passes every check", () => {
  const c = checkLeg({
    price: -200,
    lastPrice: -210,
    form: { cleared: 5, sample: 5, median: 70, position: "WR" },
    market: "Full game · 50+ receiving yards",
  });
  assert.equal(verdict(c), "pass");
  assert.equal(Math.round(breakEven(-200) * 10) / 10, 66.7);
});

test("near even money, heavy chalk, Pick of the Day band, halftime unders and missing prices", () => {
  assert.equal(status(checkLeg({ price: -120, market: "Over 86.5 rushing yards" }), "R2"), "fail");
  assert.equal(status(checkLeg({ price: -900, market: "Full game · 50+ receiving yards" }), "R3"), "fail");
  assert.equal(status(checkLeg({ price: -850, market: "Full game · 50+ receiving yards", pickOfDay: true }), "R3"), "fail");
  assert.equal(status(checkLeg({ price: -220, market: "Full game · 50+ receiving yards", pickOfDay: true }), "R3"), "pass");
  assert.equal(status(checkLeg({ price: -114, market: "FULL GAME TOTAL · Under 202.5 total passing yards", matchup: "PHI @ JAX · Halftime PHI 14–JAX 7" }), "R4"), "fail");
  assert.equal(status(checkLeg({ price: -330, market: "Full game · 50+ rushing yards", matchup: "SEA @ DEN · halftime" }), "R4"), "fail");
  assert.deepEqual(checkLeg({ price: null, market: "Full game · 50+ rushing yards" }).map((c) => c.id), ["R8"]);
});

test("fewer than five games leaves R1 unknown, and the verdict unknown", () => {
  const c = checkLeg({ price: -200, form: { cleared: 3, sample: 3, median: 60, position: "RB" }, market: "Full game · 40+ rushing yards" });
  assert.equal(status(c, "R1"), "unknown");
  assert.equal(verdict(c), "unknown");
});

test("price moves are measured in cents across even money", () => {
  assert.equal(status(checkLeg({ price: -110, lastPrice: 105, market: "Full game · 40+ rushing yards" }), "R7"), "fail");
  assert.equal(status(checkLeg({ price: -240, lastPrice: -250, market: "Full game · 40+ rushing yards" }), "R7"), "pass");
  assert.equal(formLine({ cleared: 4, sample: 5, median: 62, position: "WR" }, "yds"), "Cleared 4 of last 5 · median 62 yds");
});

test("the record splits by rule verdict, using each pick's form as of its game", async () => {
  const { gatedRecords } = await import("../src/lib/priced-record");
  const leg = (key: string, name: string, odds: number, result: string) => ({
    leg_key: key, kind: "SINGLE", name, market: "Full game · 50+ receiving yards", matchup: "A @ B · Oct 15",
    game_id: "g", published_at: "2026-10-14T00:00:00Z", result, result_source: "https://espn.com/x", odds,
  });
  const legs = [leg("a", "Good", -200, "WIN"), leg("b", "Bad", -240, "LOSS"), leg("c", "New", -200, "WIN")];
  const forms = new Map([
    ["a", { cleared: 5, sample: 5, median: 80, position: "WR" }],
    ["b", { cleared: 3, sample: 5, median: 40, position: "WR" }],
  ]);
  const g = gatedRecords(legs, new Map(), forms);
  assert.deepEqual([g.pass.wins, g.pass.losses, g.fail.wins, g.fail.losses, g.unknown.wins], [1, 0, 0, 1, 1]);
});

test("the stamp of approval needs every rule passed and form 15+ points over break-even", () => {
  const form = (cleared: number, sample = 5, position = "WR") => ({ cleared, sample, median: 70, position });
  const market = "Full game · 60+ receiving yards";
  // -200 needs 66.7%: 5/5 clears it by 33 points, 4/5 (80%) by only 13.
  assert.equal(stamped({ price: -200, form: form(5), market }), true);
  assert.equal(stamped({ price: -200, form: form(4), market }), false);
  // 4/5 at -150 (60% needed) is +20: stamped.
  assert.equal(stamped({ price: -150, form: form(4), market }), true);
  // Any failed rule removes it: a 15-cent move against, heavy chalk, too few games, no price.
  assert.equal(stamped({ price: -200, lastPrice: -170, form: form(5), market }), false);
  assert.equal(stamped({ price: -200, lastPrice: -230, form: form(5), market }), true); // moved toward the pick
  assert.equal(stamped({ price: -550, form: form(5), market }), false);
  assert.equal(stamped({ price: -200, form: form(4, 4), market }), false);
  assert.equal(stamped({ price: null, form: form(5), market }), false);
  assert.equal(stamped({ price: -200, form: null, market }), false);
});
