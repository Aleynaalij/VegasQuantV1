import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDesk,
  type Desk,
  type Pick,
  type Result,
  type Entry,
  type Closing,
  type Review,
  type Game,
  type Analysis,
} from "../src/lib/domain";
import { performance } from "../src/lib/performance";
import { publishingChecks } from "../src/lib/publishing-checks";
import { freshness } from "../src/lib/freshness";
const now = Date.parse("2026-10-01T10:00:00Z");
const game = { id: "g", kickoff: "2026-10-02T00:15:00Z" } as Game;
const payload = {
  game_id: "g",
  analysis_id: "a",
  stage_id: null,
  market: "Player Prop",
  selection: "Synthetic test over 22.5",
  book: "Test book",
  predicted_close: "Analyst supplied",
  best_number: "22.5 -114",
  bet_grade: "A-",
  timing: "Analyst supplied",
  playable_number: "22.5 -120",
  pass_number: "25.5",
  why_like: "Test rationale",
  why_lose: "Test risk",
  raw_handoff: "Test handoff",
  recommended_line: 22.5,
  direction: "over",
  odds: -114,
  stake_cents: 2000,
  model_probability: 58.5,
  market_probability: 53.3,
  edge: 5.2,
  confidence: 7.5,
  risk: 5,
  fear_index: 6.5,
};
const desk = {
  ...emptyDesk,
  games: [game],
  analyses: [
    {
      id: "a",
      game_id: "g",
      version: 1,
      created_at: "2026-10-01T09:00:00Z",
    } as Analysis,
  ],
};
test("missing and future source times never look fresh", () => {
  assert.equal(freshness(null, now).minutes, null);
  assert.equal(freshness("bad", now).label, "Time not supplied");
  assert.equal(freshness("2026-10-02T00:00:00Z", now).tone, "red");
  assert.equal(freshness("2026-10-01T03:00:00Z", now).tone, "gold");
});
test("publishing blocks insufficient edge, missing stake, invalid odds and kickoff", () => {
  for (const patch of [
    { edge: 2.9 },
    { stake_cents: 0 },
    { stake_cents: NaN },
    { odds: -99 },
    { recommended_line: null },
    { direction: null },
  ])
    assert.ok(
      publishingChecks("pick", { ...payload, ...patch }, desk, now).some(
        (c) => c.level === "block",
      ),
    );
  assert.ok(
    publishingChecks("pick", payload, desk, Date.parse(game.kickoff)).some(
      (c) => c.level === "block",
    ),
  );
  assert.equal(
    publishingChecks("pick", payload, desk, now).filter(
      (c) => c.level === "block",
    ).length,
    0,
  );
});
test("probability inconsistencies warn without altering published values", () => {
  const p = { ...payload, edge: 8 };
  const before = JSON.stringify(p);
  assert.ok(
    publishingChecks("pick", p, desk, now).some(
      (c) => c.level === "warning" && c.message.includes("Stated edge differs"),
    ),
  );
  assert.equal(JSON.stringify(p), before);
});
test("duplicate selection and wrong-game analysis are blocked", () => {
  assert.ok(
    publishingChecks(
      "pick",
      payload,
      { ...desk, picks: [{ ...payload, id: "p" } as unknown as Pick] },
      now,
    ).some((c) => c.level === "block"),
  );
  assert.ok(
    publishingChecks(
      "pick",
      { ...payload, analysis_id: "other" },
      desk,
      now,
    ).some((c) => c.level === "block"),
  );
});
test("result requires actual entry and missing close is explicit", () => {
  const d = { ...desk, picks: [{ ...payload, id: "p" } as unknown as Pick] };
  const checks = publishingChecks(
    "result",
    {
      pick_id: "p",
      result: "WIN",
      away_score: 20,
      home_score: 17,
      source: "Test",
    },
    d,
    Date.parse(game.kickoff) + 3600000,
  );
  assert.ok(
    checks.some(
      (c) => c.level === "block" && c.message.includes("Actual bet entry"),
    ),
  );
  assert.ok(
    checks.some(
      (c) => c.level === "warning" && c.message.includes("Closing line"),
    ),
  );
});
test("performance separates pending, pushes, voids and latest process review", () => {
  const picks = ["win", "loss", "push", "void", "pending"].map(
    (id) =>
      ({
        id,
        stake_cents: 2000,
        edge: 5,
        confidence: 7,
        market: "Side",
      }) as Pick,
  );
  const results = [
    ["win", "WIN", 1754],
    ["loss", "LOSS", -2000],
    ["push", "PUSH", 0],
    ["void", "VOID", 0],
  ].map(
    ([id, result, profit], i) =>
      ({
        pick_id: id,
        result,
        profit_cents: profit,
        created_at: `2026-10-0${i + 1}T10:00:00Z`,
      }) as Result,
  );
  const d: Desk = {
    ...emptyDesk,
    picks,
    results,
    reviews: [
      { pick_id: "win", grade: "F", created_at: "2026-10-01T00:00:00Z" },
      { pick_id: "win", grade: "A", created_at: "2026-10-02T00:00:00Z" },
    ] as Review[],
    entries: [
      { pick_id: "win", line: 3, odds: -114 },
      { pick_id: "loss", line: 3, odds: -110 },
    ] as Entry[],
    closings: [
      { pick_id: "win", line: 3, odds: -120 },
      { pick_id: "loss", line: 2.5, odds: -120 },
    ] as Closing[],
  };
  const m = performance(d);
  assert.equal(m.pending, 1);
  assert.equal(m.winRate, 50);
  assert.equal(m.roi, (-246 / 6000) * 100);
  assert.equal(m.net, -246);
  assert.equal(m.units, 1754 / 2000 - 1);
  assert.equal(m.avgGrade, 4);
  assert.equal(m.graded, 1);
  assert.equal(m.clvCount, 1);
  assert.equal(m.drawdown, 2000);
  assert.deepEqual(
    m.curve.map((x) => x.net),
    [1754, -246, -246, -246],
  );
  assert.equal(performance(d, []).roi, null);
  assert.equal(performance(d, []).avgClv, null);
});
