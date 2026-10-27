import test from "node:test";
import assert from "node:assert/strict";
import {
  consensus,
  noVig,
  probabilityOdds,
  latestByBook,
  newsContext,
  inputSchemas,
  type Quote,
  type News,
} from "../src/lib/intelligence";
const at = Date.parse("2026-10-01T12:00:00Z");
const q = (book: string, patch: Partial<Quote> = {}): Quote => ({
  id: book,
  market_id: "m",
  book,
  line: 22.5,
  odds: -110,
  opposite_odds: -110,
  observed_at: "2026-10-01T11:55:00Z",
  created_at: "2026-10-01T11:56:00Z",
  time_basis: "observed",
  source: "Synthetic",
  notes: "",
  ...patch,
});
test("proportional no-vig removes a symmetric margin without inventing a missing opposite", () => {
  assert.equal(noVig(-110, -110)?.probability, 0.5);
  assert.equal(probabilityOdds(0.5), -100);
  assert.equal(noVig(-114, null), null);
  assert.equal(noVig(NaN, -110), null);
});
test("consensus excludes stale, receipt-only, future and different-line quotes", () => {
  const rows = [
    q("Circa"),
    q("Pinnacle"),
    q("Bookmaker", { time_basis: "received" }),
    q("Other", { observed_at: "2026-10-01T10:00:00Z" }),
    q("Future", { observed_at: "2026-10-01T12:01:00Z" }),
    q("Different", { line: 23.5 }),
  ];
  const c = consensus(
    rows,
    rows.map((q) => q.book),
    22.5,
    at,
  );
  assert.equal(c.eligible.length, 2);
  assert.equal(c.fairProbability, 0.5);
  assert.equal(c.paired.length, 2);
});
test("one book is not consensus and duplicate observations cannot overweight a book", () => {
  assert.equal(
    consensus([q("Circa")], ["Circa"], 22.5, at).fairProbability,
    null,
  );
  const c = consensus(
    [
      q("Circa"),
      q("Circa", {
        id: "old",
        observed_at: "2026-10-01T11:50:00Z",
        odds: -200,
      }),
      q("Pinnacle"),
    ],
    ["Circa", "Pinnacle"],
    22.5,
    at,
  );
  assert.equal(c.eligible.length, 2);
  assert.equal(c.fairProbability, 0.5);
});
test("later main-line quote invalidates an earlier number instead of reviving it", () => {
  const c = consensus(
    [
      q("Circa"),
      q("Circa", {
        id: "latest",
        line: 23.5,
        observed_at: "2026-10-01T11:59:00Z",
      }),
      q("Pinnacle"),
    ],
    ["Circa", "Pinnacle"],
    22.5,
    at,
  );
  assert.equal(c.eligible.length, 1);
  assert.equal(c.fairProbability, null);
});
test("news comparison requires actual observed prices and an hour window", () => {
  const n = { observed_at: "2026-10-01T11:55:00Z" } as News;
  const c = newsContext(
    n,
    [
      q("Circa", { observed_at: "2026-10-01T11:54:00Z" }),
      q("Circa", { id: "after", observed_at: "2026-10-01T11:56:00Z" }),
      q("Circa", {
        id: "received",
        time_basis: "received",
        observed_at: "2026-10-01T11:55:30Z",
      }),
    ],
    "Circa",
  );
  assert.equal(c.after?.id, "after");
  assert.equal(c.before?.id, "Circa");
});
test("missing source, invalid prices and undocumented sharp fair lines are rejected", () => {
  const base = {
    market_id: "00000000-0000-4000-8000-000000000001",
    book: "Circa",
    line: 22.5,
    odds: -110,
    opposite_odds: null,
    observed_at: "2026-09-01T00:00:00Z",
    time_basis: "observed",
    source: "Test",
    notes: "",
  };
  assert.ok(inputSchemas.quotes.safeParse(base).success);
  assert.ok(!inputSchemas.quotes.safeParse({ ...base, source: "" }).success);
  assert.ok(!inputSchemas.quotes.safeParse({ ...base, odds: 0 }).success);
  assert.ok(
    !inputSchemas.models.safeParse({
      market_id: base.market_id,
      true_line: null,
      projection: "29-31",
      probability: null,
      probability_line: null,
      sharp_fair_line: 30,
      sharp_method: null,
      observed_at: base.observed_at,
      source: "Test",
      notes: "",
    }).success,
  );
});
