import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  eventFinding,
  filterEvents,
  hubFilters,
  hubHref,
  safeSource,
  sourceAge,
  type Finding,
  type ResearchEvent,
} from "../src/lib/research-hub";
import {
  nbaFindings,
  nflFindings,
  sportFindings,
} from "../src/lib/research-hub-reader";
import type { SportPage } from "../src/lib/sport-contract";
const event: ResearchEvent = {
  key: "nba:game-a",
  id: "game-a",
  sport: "nba",
  slug: "a-at-b",
  away: "Boston",
  home: "Detroit",
  start: "2026-11-07T00:30:00Z",
  tbd: false,
  venue: "Arena",
  status: "Scheduled",
  source: "https://example.com/schedule",
  scheduleAt: null,
};
const finding: Finding = {
  id: "injury-a",
  eventKey: event.key,
  topic: "injuries",
  title: "Availability",
  text: "Jay Sample: Questionable",
  sources: ["https://example.com/injury"],
  sourceAt: "2026-11-06T20:00:00Z",
  recordedAt: "2026-11-06T22:00:00Z",
  label: "Provider report",
};
test("sport, ET date, player research and topic filters preserve exact identity", () => {
  const filters = hubFilters(
    new URLSearchParams("sport=nba&date=2026-11-06&topic=injuries&q=Jay"),
  );
  assert.deepEqual(
    filterEvents(
      [event, { ...event, key: "nhl:other", id: "other", sport: "nhl" }],
      [finding],
      filters,
    ),
    [event],
  );
  assert.equal(
    filterEvents([event], [finding], { ...filters, date: "2026-11-07" }).length,
    0,
  );
  assert.equal(
    filterEvents([event], [finding], { ...filters, query: "Wrong Player" })
      .length,
    0,
  );
});
test("filter state and dossier identity survive a shareable URL round trip", () => {
  const filters = hubFilters(
    new URLSearchParams(
      "sport=nhl&topic=context&date=2026-11-06&q=New+York&event=nhl%3Agame-1",
    ),
  );
  assert.deepEqual(
    hubFilters(new URL(hubHref(filters), "https://example.com").searchParams),
    filters,
  );
  assert.equal(
    hubFilters(new URLSearchParams("sport=constructor&topic=trap&date=nope"))
      .sport,
    "all",
  );
});
test("receipt/publication times cannot falsely make an old or unknown source recent", () => {
  const now = Date.parse("2026-11-06T22:00:00Z");
  assert.equal(sourceAge(null, now), "Source time unknown");
  assert.equal(sourceAge("2026-11-07T00:00:00Z", now), "Source time unknown");
  assert.equal(sourceAge("2026-11-05T22:00:00Z", now), "Older source snapshot");
  assert.equal(
    sourceAge("2026-11-06T21:40:00Z", now),
    "Recent source snapshot",
  );
  assert.equal(sourceAge("not a date", now), "Source time unknown");
});
test("wrong game or sport cannot attach findings even with matching team text", () => {
  const item = { ...finding };
  assert.equal(eventFinding(event, { game_id: "another" }, item), null);
  assert.equal(
    eventFinding(event, { game_id: event.id, sport: "nfl" }, item),
    null,
  );
  const observation = {
    id: "bad",
    game_id: "another",
    kind: "injury",
    provider: "ESPN",
    source: "https://example.com",
    observed_at: null,
    recorded_at: finding.recordedAt!,
    payload: { player: "Jay Sample", status: "Out" },
  };
  assert.equal(nbaFindings(event, [observation]).length, 0);
  assert.equal(
    nbaFindings({ ...event, sport: "nfl" }, [
      { ...observation, game_id: event.id },
    ]).length,
    0,
  );
  assert.equal(nflFindings(event, [], [], []).length, 0);
});
test("sport RPC mismatches and denied access never expose protected findings", () => {
  const page = {
    version: 1,
    sport: "nhl",
    access: true,
    games: [{ id: event.id, sport: "nhl" }],
    facts: [],
    markets: [],
    selections: [],
  } as unknown as SportPage;
  assert.deepEqual(sportFindings(event, page), []);
  assert.deepEqual(
    sportFindings({ ...event, sport: "nhl" }, { ...page, access: false }),
    [],
  );
});
test("unavailable lineup topics keep relevant events discoverable without claiming starters", () => {
  const f = hubFilters(new URLSearchParams("topic=lineups&sport=nba"));
  assert.equal(filterEvents([event], [finding], f).length, 1);
  assert.equal(safeSource("javascript:alert(1)"), null);
  assert.equal(safeSource("https://user:secret@example.com"), null);
});
import { supabase } from "../src/lib/supabase";
import { readResearchHub } from "../src/lib/research-hub-reader";
function stubReads(
  t: TestContext,
  options: { denied?: boolean; failure?: boolean },
) {
  const tables: string[] = [];
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: null },
    error: null,
  }));
  t.mock.method(
    supabase,
    "rpc",
    async (name: string, args?: { p_sport?: string }) =>
      name === "membership_status"
        ? { data: { allowed: !options.denied }, error: null }
        : {
            data: {
              version: 1,
              sport: args?.p_sport,
              access: !options.denied,
              games: [],
              facts: [],
              markets: [],
              selections: [],
            },
            error: null,
          },
  );
  t.mock.method(supabase, "from", (table: string) => {
    tables.push(table);
    const result = {
      data: [],
      error: options.failure ? { message: "Source offline" } : null,
    };
    const chain: Record<string, unknown> = {
      then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    };
    for (const name of ["select", "eq", "gte", "lt", "in", "order", "limit"])
      chain[name] = () => chain;
    return chain;
  });
  return tables;
}
test("schedule failure is a reported source error, never a healthy empty schedule", async (t) => {
  stubReads(t, { failure: true });
  const result = await readResearchHub();
  assert.equal(result.events.length, 0);
  assert.equal(
    result.errors.filter((e) => e.includes("unavailable")).length,
    2,
  );
  t.mock.restoreAll();
});
test("denied readers never request NFL/NBA protected research or retain findings", async (t) => {
  const tables = stubReads(t, { denied: true });
  const result = await readResearchHub();
  assert.equal(result.denied, true);
  assert.equal(result.findings.length, 0);
  assert.ok(
    !tables.includes("analysis_versions") &&
      !tables.includes("nba_observations"),
  );
  t.mock.restoreAll();
});
test("inherited structured weather keeps its original publication and issue time", () => {
  const e = { ...event, key: "nfl:game-a", sport: "nfl" as const };
  const first = {
    id: "a",
    game_id: e.id,
    version: 1,
    title: "Original",
    sections: {},
    projections: {},
    raw_handoff: "",
    source: "https://example.com/weather",
    created_at: "2026-11-05T00:00:00Z",
    intelligence: {
      weather: { forecast: "Rain", issued_at: "2026-11-04T23:00:00Z" },
    },
  };
  const rows = nflFindings(
    e,
    [
      first,
      { ...first, id: "b", version: 2, created_at: "2026-11-06T22:00:00Z" },
    ],
    [],
    [],
  );
  const weather = rows.find((r) => r.topic === "weather")!;
  assert.equal(weather.recordedAt, first.created_at);
  assert.equal(weather.sourceAt, "2026-11-04T23:00:00Z");
  assert.match(weather.text, /Rain/);
});
