import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  fearEvidence,
  type FearEvent,
  type FearRow,
} from "../src/lib/vegas-fear";
import { fearDetail } from "../src/lib/vegas-fear-reader";

const now = Date.parse("2026-11-06T20:00:00Z");
const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const event: FearEvent = {
  id: "event-1",
  sport: "nba",
  home: "Home",
  away: "Away",
  start: at(-120),
  tbd: false,
};
function row(
  minutes: number,
  line: number,
  odds: number,
  book = "FanDuel",
  market = "spreads",
): FearRow {
  return {
    id: JSON.stringify([minutes, book, market]),
    game_id: event.id,
    kind: "odds",
    provider: "The Odds API",
    source: "https://the-odds-api.com",
    observed_at: at(minutes),
    recorded_at: at(0),
    payload: {
      book,
      market,
      event_id: "provider-event",
      outcomes: [{ name: "Home", point: line, price: odds }],
    },
  };
}

test("separates threshold changes, duplicates, books, markets and event identity", () => {
  const first = row(20, -2, -110),
    latest = row(4, -3, -112);
  const other = row(2, -3, 110, "DraftKings");
  const differentMarket = row(1, -3, -120, "BetMGM", "totals");
  differentMarket.payload.outcomes = [
    { name: "Over", point: 219, price: -120 },
  ];
  const result = fearEvidence(
    event,
    [
      latest,
      other,
      differentMarket,
      first,
      { ...first, id: "copy" },
      {
        ...latest,
        game_id: "another",
        payload: { ...latest.payload, book: "Wrong event" },
      },
    ],
    now,
  );
  assert.equal(result.tapes.length, 3);
  const tape = result.tapes.find((t) => t.latest.book === "FanDuel")!;
  assert.equal(tape.observations, 2);
  assert.equal(tape.first.line, -2);
  assert.equal(tape.latest.line, -3);
  assert.deepEqual(
    result.dispersion.map((d) => d.quotes.map((q) => q.book)),
    [["DraftKings", "FanDuel"]],
  );
});

test("dispersion requires identical threshold and contemporaneous observed times", () => {
  const data = fearEvidence(
    event,
    [
      row(1, -3, -110),
      row(3, -2, -110, "DraftKings"),
      row(25, -3, -110, "BetMGM"),
      row(31, -3, 100, "Fanatics"),
      { ...row(4, -3, 105, "Caesars"), observed_at: null },
    ],
    now,
  );
  assert.equal(data.dispersion.length, 0);
  assert.equal(data.excluded, 1);
  assert.equal(
    data.tapes.find((t) => t.latest.book === "Fanatics")?.stale,
    true,
  );
  assert.ok(data.tapes.every((t) => t.observations === 1));
});

test("does not revive withdrawn selections or combine ambiguous provider events", () => {
  const old = row(20, -3, -110),
    removed = row(1, -3, -110);
  removed.payload.outcomes = [];
  assert.equal(fearEvidence(event, [removed, old], now).tapes.length, 0);
  const other = row(1, -3, -110, "DraftKings");
  other.payload.event_id = "different-provider-event";
  assert.equal(fearEvidence(event, [old, other], now).ambiguous, true);
});

test("keeps both NBA collector feeds for the same event and rejects genuine mapping conflicts", () => {
  const spread = { ...row(4, -3, -110), provider: "The Odds API NBA" };
  const prop = {
    ...row(4, 21.5, -110, "FanDuel", "player_points"),
    provider: "The Odds API NBA props",
    kind: "prop",
  };
  prop.payload.outcomes = [
    { name: "Over", description: "Player A", point: 21.5, price: -110 },
  ];
  const result = fearEvidence(event, [spread, prop], now);
  assert.equal(result.ambiguous, false);
  assert.deepEqual(
    result.tapes.map((t) => [t.latest.provider, t.latest.market]),
    [
      ["The Odds API NBA", "spreads"],
      ["The Odds API NBA props", "player_points"],
    ],
  );
  const conflict = {
    ...prop,
    payload: { ...prop.payload, event_id: "different" },
  };
  assert.equal(fearEvidence(event, [spread, conflict], now).ambiguous, true);
  assert.equal(
    fearEvidence(event, [spread, { ...prop, provider: "Other source" }], now)
      .ambiguous,
    true,
  );
});

test("keeps prop player and selection distinct and excludes duplicate alternate offers", () => {
  const prop = row(4, 21.5, -110, "FanDuel", "player_points");
  prop.kind = "prop";
  prop.payload.outcomes = [
    { name: "Over", description: "Player A", point: 21.5, price: -110 },
    { name: "Over", description: "Player B", point: 21.5, price: 110 },
  ];
  assert.deepEqual(
    fearEvidence(event, [prop], now).tapes.map((t) => t.latest.player),
    ["Player A", "Player B"],
  );
  (prop.payload.outcomes as unknown[]).push({
    name: "Over",
    description: "Player A",
    point: 22.5,
    price: -110,
  });
  assert.equal(fearEvidence(event, [prop], now).tapes.length, 0);
});

test("reader scopes real PostgREST URLs to the selected event and separates source failures", async () => {
  const urls: URL[] = [];
  const client = createClient("https://fixture.example", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        if (url.searchParams.get("kind") === "eq.injury")
          return Response.json(
            { message: "Source unavailable" },
            { status: 403 },
          );
        return Response.json([row(20, -2, -110), row(4, -2, -112)]);
      },
    },
  });
  const data = await fearDetail(event, now, client);
  assert.equal(urls.length, 2);
  for (const url of urls) {
    assert.equal(url.pathname, "/rest/v1/nba_observations");
    assert.equal(url.searchParams.get("game_id"), "eq.event-1");
  }
  const market = urls.find((url) =>
    url.searchParams.get("kind")?.includes("prop"),
  )!;
  assert.equal(market.searchParams.get("limit"), "251");
  assert.deepEqual(market.searchParams.getAll("recorded_at"), [
    "gte." + at(72 * 60),
    "lte." + at(0),
  ]);
  assert.match(
    market.searchParams.get("payload->>market") || "",
    /player_points/,
  );
  assert.equal(market.searchParams.get("order"), "recorded_at.desc,id.asc");
  assert.equal(data.contextError, true);
  assert.equal(data.marketError, false);
  assert.equal(data.evidence.tapes[0].observations, 2);
});

test("quote pages retain tied rows across the old 500-row limit and freeze the receipt window", async () => {
  const tiedReceipt = at(0).replace(".000Z", ".000001+00:00");
  const oldReceipt = tiedReceipt.replace(".000001", ".000000");
  const rows = Array.from({ length: 604 }, (_, index) => ({
    ...row(
      index + 1,
      -2,
      -110,
      index % 2 ? "FanDuel" : "DraftKings",
      index % 3 ? "spreads" : "h2h",
    ),
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    recorded_at: oldReceipt,
    payload:
      index % 3
        ? row(0, -2, -110, index % 2 ? "FanDuel" : "DraftKings").payload
        : {
            ...row(0, -2, -110, "FanDuel", "h2h").payload,
            outcomes: [{ name: "Home", price: -110 }],
          },
  }));
  const requests: URL[] = [];
  let fail = false;
  let cancel: AbortController | undefined;
  const client = createClient("https://fixture.example", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.searchParams.get("kind") === "eq.injury")
          return Response.json([]);
        requests.push(url);
        const cursor = url.searchParams.get("or");
        if (cursor) {
          assert.ok(
            cursor.includes(oldReceipt),
            "keep exact microsecond tie text in cursor",
          );
          if (fail)
            return Response.json({ message: "page offline" }, { status: 403 });
          const id = cursor.match(/id\.gt\.([0-9a-f-]+)/)?.[1];
          return Response.json(
            rows.filter((row) => row.id > (id || "")).slice(0, 251),
          );
        }
        cancel?.abort();
        return Response.json(rows.slice(0, 251));
      },
    },
  });
  const complete = await fearDetail(event, now, client);
  assert.equal(requests.length, 3);
  assert.ok(
    requests.every((r) =>
      r.searchParams.getAll("recorded_at").includes("lte." + at(0)),
    ),
  );
  assert.equal(complete.marketCoverage.rows, 604);
  assert.equal(complete.marketCoverage.earliest, Date.parse(at(604)));
  assert.equal(complete.marketCoverage.latest, Date.parse(at(1)));
  assert.equal(complete.marketCoverage.markets, 2);
  assert.equal(complete.marketCoverage.books, 2);
  assert.equal(complete.marketError, false);
  assert.equal(complete.marketTruncated, false);

  fail = true;
  const partial = await fearDetail(event, now, client);
  assert.equal(partial.marketError, true);
  assert.equal(partial.marketCoverage.rows, 250);
  assert.ok(partial.evidence.tapes.length);

  cancel = new AbortController();
  const before = requests.length;
  await assert.rejects(fearDetail(event, now, client, cancel.signal), {
    name: "AbortError",
  });
  assert.equal(requests.length, before + 1);
});

test("tester Fear paginates the projected API and never reads raw observations", async () => {
  const receipt = at(0).replace(".000Z", ".000001+00:00");
  const rows = Array.from({ length: 251 }, (_, index) => ({
    ...row(4, -3, -110),
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    recorded_at: receipt,
  }));
  const calls: Record<string, string>[] = [];
  const client = createClient("https://fixture.example", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        assert.equal(
          new URL(String(input)).pathname,
          "/rest/v1/rpc/tester_observation_page",
        );
        const args = JSON.parse(String(init?.body));
        calls.push(args);
        if (args.p_section === "injury") return Response.json([]);
        return Response.json(args.p_after_id ? rows.slice(250) : rows);
      },
    },
  });
  const detail = await fearDetail(event, now, client, undefined, true);
  assert.equal(detail.marketError, false);
  assert.equal(detail.marketCoverage.rows, 251);
  const quoteCalls = calls.filter((c) => c.p_section === "quotes");
  assert.equal(quoteCalls.length, 2);
  assert.equal(quoteCalls[1].p_before, receipt);
  assert.equal(quoteCalls[1].p_after_id, rows[249].id);
  assert.ok(
    calls.every((c) => c.p_feature === "fear" && c.p_game === event.id),
  );
});
