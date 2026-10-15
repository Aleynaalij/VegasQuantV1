import { test } from "node:test";
import assert from "node:assert/strict";
import { researchFacts } from "../src/lib/research-facts";

test("model plumbing (ids, hashes, status codes, coverage) never reaches members", () => {
  const model = {
    as_of: "2026-10-14T16:06:10Z",
    status: "SHADOW_ONLY",
    coverage: { cards: 712, priced: 0, unavailable: 712 },
    model_id: "4838aea2c8cd5618f9873d896cd6f3405a5f7b24f140d32ce442900905d8daa1",
    input_sources: [{ file: "stats.csv", sha256: "e5e0615b3d96a3eaebfaee91e55afb4a4e7fe0caf057454177bcd7d6ad4bcfc2" }],
  };
  assert.deepEqual(researchFacts(model), []);
});

test("readable research keeps friendly labels, with fine print last", () => {
  const [facts] = researchFacts({
    quote_notice: "Informational; not a live quote.",
    spread: "ARI -2.5",
    total: 38.5,
    FanDuel: "Collector not configured; prices unknown.",
    observed_at: "2026-10-02T23:04:59Z",
    public_read: "ARI spread: 57% bets / 85% handle.",
    source: "https://example.com/splits",
    target_quote: { line: "-3", odds: 100 },
  });
  assert.deepEqual(
    facts.map((f) => [f.label, f.kind]),
    [["Spread", "text"], ["Total", "text"], ["Line seen", "time"], ["Public money", "text"],
     ["Source", "link"], ["Target price", "text"], ["Quote notice", "note"]],
  );
  assert.equal(facts.find((f) => f.label === "Target price")?.value, "-3 (+100)");
});

test("placeholders alone leave the topic empty", () => {
  assert.deepEqual(researchFacts({ sharp_consensus: "Unknown; unavailable.", fear_index: "Unknown." }), []);
  assert.deepEqual(researchFacts([]), []);
  assert.equal(researchFacts([{ player: "J. Smith", status: "Questionable" }]).length, 1);
});

test("nested details are flattened into readable labels, bookkeeping still hidden", () => {
  const [facts] = researchFacts({ wind: { speed: 15, unit: "mph", id: "x" }, forecast: "Clear" });
  assert.deepEqual(facts.map((f) => [f.label, f.value]), [["Wind speed", "15"], ["Wind unit", "mph"], ["Forecast", "Clear"]]);
  const [rows] = researchFacts({ notes: [{ player: "J. Smith", status: "Out" }] });
  assert.deepEqual(rows.map((f) => f.label), ["Notes player", "Notes status"]);
});

test("malformed links are dropped instead of breaking the page; good links show their site", () => {
  const [facts] = researchFacts({ spread: "-2.5", source: "https://", other: "https://www.weather.gov/x" });
  assert.deepEqual(facts.map((f) => [f.label, f.kind, f.host]), [["Spread", "text", undefined], ["Other", "link", "weather.gov"]]);
});
