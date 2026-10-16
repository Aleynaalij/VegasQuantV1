import { test } from "node:test";
import assert from "node:assert/strict";
import { bookPrices, bookQuotes, marketPrice, wantedLine, marketKeys, type Observation } from "../supabase/functions/result-sync/prices";

const c = { game_id: "g", player: "James Cook", metric: "rushing_yards" as const, operator: "gte" as const, threshold: 60 };
const obs = (at: string, market: string, outcomes: Observation["payload"]["outcomes"], book = "FanDuel", game_id = "g"): Observation =>
  ({ game_id, observed_at: at, payload: { market, book, outcomes } });

test("N+ targets map to the Over (N - 0.5) line; Over/Under keep their exact point", () => {
  assert.deepEqual(wantedLine({ operator: "gte", threshold: 60 }), { name: "Over", point: 59.5 });
  assert.deepEqual(wantedLine({ operator: "under", threshold: 38.5 }), { name: "Under", point: 38.5 });
  assert.deepEqual(marketKeys("receptions"), ["player_receptions", "player_receptions_alternate"]);
});

test("latest exact FanDuel line up to the cutoff; other books, players and points are ignored", () => {
  const list = [
    obs("2026-10-18T10:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -160 }]),
    obs("2026-10-18T14:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -175 }]),
    obs("2026-10-18T18:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -190 }]),
    obs("2026-10-18T15:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -999 }], "DraftKings"),
    obs("2026-10-18T15:00:00Z", "player_rush_yds", [{ name: "Over", description: "James Cook", point: 64.5, price: -110 }]),
    obs("2026-10-18T15:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "Ray Davis", point: 59.5, price: 200 }], "FanDuel", "other"),
  ];
  const kickoff = Date.parse("2026-10-18T17:00:00Z");
  assert.deepEqual(marketPrice(c, list, kickoff), { book: "FanDuel", price: -175, point: 59.5, observed_at: "2026-10-18T14:00:00Z" });
  assert.equal(marketPrice({ ...c, game_id: "other" }, list, kickoff), null);
});

test("name suffixes match and conflicting prices in one snapshot are skipped", () => {
  const at = Date.parse("2026-10-19T00:00:00Z");
  assert.equal(marketPrice(c, [obs("2026-10-18T10:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook III", point: 59.5, price: -150 }])], at)?.price, -150);
  assert.equal(marketPrice(c, [obs("2026-10-18T10:00:00Z", "player_rush_yds_alternate", [
    { name: "Over", description: "James Cook", point: 59.5, price: -150 },
    { name: "Over", description: "James Cook", point: 59.5, price: -140 },
  ])], at), null);
});

test("line shopping: the latest exact-line price at every book, and one named book on request", () => {
  const list = [
    obs("2026-10-18T10:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -160 }]),
    obs("2026-10-18T11:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -140 }], "DraftKings"),
    obs("2026-10-18T12:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -150 }], "DraftKings"),
    obs("2026-10-18T12:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 64.5, price: 105 }], "BetMGM"),
  ];
  const at = Date.parse("2026-10-18T17:00:00Z");
  assert.deepEqual(
    bookPrices(c, list, at).map((p) => [p.book, p.price]),
    [["DraftKings", -150], ["FanDuel", -160]],
  );
  assert.equal(marketPrice(c, list, at, "DraftKings")?.price, -150);
  assert.equal(marketPrice(c, list, at, "Caesars"), null);
});

test("a book's latest snapshot decides: a withdrawn line is not revived from an older snapshot", () => {
  const at = Date.parse("2026-10-18T17:00:00Z");
  const list = [
    obs("2026-10-18T10:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -160 }], "DraftKings"),
    obs("2026-10-18T12:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 64.5, price: -120 }], "DraftKings"),
    obs("2026-10-18T12:00:00Z", "player_rush_yds_alternate", [{ name: "Over", description: "James Cook", point: 59.5, price: -170 }]),
  ];
  assert.deepEqual(bookQuotes(c, list, at), {
    prices: [{ book: "FanDuel", price: -170, point: 59.5, observed_at: "2026-10-18T12:00:00Z" }],
    quoting: ["DraftKings", "FanDuel"],
  });
});
