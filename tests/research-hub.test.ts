import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  eventFinding,
  filterEvents,
  hubFilters,
  hubHref,
  safeSource,
  sourceAge,
  sportErrors,
  searchHits,
  snippet,
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
import {
  nflObservationFindings,
  publishedFindings,
} from "../src/lib/research-hub-reader";
test("NFL collector injuries and published legs use exact event IDs and original times", () => {
  const e = { ...event, key: "nfl:game-a", sport: "nfl" as const };
  const observation = {
    id: "o",
    game_id: e.id,
    kind: "injury",
    provider: "ESPN",
    source: "https://example.com/injuries",
    observed_at: null,
    recorded_at: "2026-11-06T22:00:00Z",
    payload: {
      team: "Seattle",
      player: "Collected Runner",
      status: "Questionable",
      injury: "Ankle",
    },
  };
  const rows = nflObservationFindings(e, [
    observation,
    {
      ...observation,
      id: "wrong",
      game_id: "other",
      payload: { player: "Wrong Event Player" },
    },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /Collected Runner.*Questionable/);
  assert.equal(rows[0].sourceAt, null);
  const leg = {
    leg_key: "published:1",
    game_id: e.id,
    name: "Collected Runner",
    market: "60+ yards",
    why: "Original case",
    risk: "Role risk",
    quote: "Original price",
    quote_observed_at: "2026-11-05T21:00:00Z",
    published_at: "2026-11-05T22:00:00Z",
    result: "PENDING",
  };
  assert.equal(publishedFindings(e, [{ ...leg, game_id: "wrong" }]).length, 0);
  const f = publishedFindings(e, [leg])[0];
  assert.equal(f.recordedAt, leg.published_at);
  assert.equal(f.sourceAt, leg.quote_observed_at);
  assert.match(f.publicationHref!, /view=selection/);
});
test("collector-shaped NBA props retain every player and exact quoted outcome in search", () => {
  const props = nbaFindings(event, [
    {
      id: "prop-identity",
      game_id: event.id,
      kind: "prop",
      provider: "The Odds API",
      source: "https://example.com/props",
      observed_at: null,
      recorded_at: "2026-11-06T20:00:00Z",
      payload: {
        book: "FanDuel",
        market: "player_points",
        outcomes: [
          {
            name: "Over",
            description: "Jayson Tatum",
            point: 27.5,
            price: -110,
          },
          {
            name: "Under",
            description: "Jayson Tatum",
            point: 27.5,
            price: -115,
          },
          {
            name: "Over",
            description: "Cade Cunningham",
            point: 24.5,
            price: 105,
          },
        ],
      },
    },
  ]);
  assert.match(props[0].text, /Jayson Tatum.*Over 27\.5 \(-110\)/);
  assert.match(props[0].text, /Jayson Tatum.*Under 27\.5 \(-115\)/);
  assert.match(props[0].text, /Cade Cunningham.*Over 24\.5 \(\+105\)/);
  for (const name of ["Jayson Tatum", "Cade Cunningham"])
    assert.equal(
      filterEvents([event], props, hubFilters(new URLSearchParams({ q: name })))
        .length,
      1,
    );
});
test("missing selected-topic coverage stays discoverable as unrelated evidence arrives", () => {
  for (const topic of [
    "overview",
    "injuries",
    "lineups",
    "weather",
    "context",
    "markets",
  ]) {
    const filters = hubFilters(new URLSearchParams({ sport: "nba", topic }));
    for (const otherTopic of ["markets", "context"] as const) {
      const unrelated = { ...finding, topic: otherTopic };
      assert.deepEqual(filterEvents([event], [], filters), [event]);
      assert.deepEqual(
        filterEvents([event], [unrelated], filters),
        [event],
        `${topic} missing with ${otherTopic} present`,
      );
    }
  }
});
test("NFL prose source links use the same no-credentials boundary as every other adapter", () => {
  const rows = nflFindings(
    { ...event, sport: "nfl", key: "nfl:" + event.id },
    [
      {
        id: "a",
        game_id: event.id,
        version: 1,
        title: "Briefing",
        sections: {
          Injuries: "Player status is uncertain.",
          Sources:
            "https://fixture:fixture@example.com/report https://example.com/safe",
        },
        projections: {},
        raw_handoff: "",
        source: "",
        created_at: "2026-11-06T20:00:00Z",
      },
    ],
    [],
    [],
  );
  assert.deepEqual(rows[0].sources, ["https://example.com/safe"]);
});

test("the hub reader retains older injuries across refresh with bounded, isolated queries", async (t) => {
  const start = new Date("2026-11-06T12:00:00Z");
  t.mock.timers.enable({ apis: ["Date"], now: start });
  stubReads(t, {});
  const hour = 3600000;
  const receipt = new Date(+start - 47 * hour).toISOString();
  const observed = new Date(+start - 48 * hour).toISOString();
  const injury = {
    id: "injury-old",
    game_id: "game-a",
    kind: "injury",
    provider: "Provider A",
    source: "https://example.com/report",
    recorded_at: receipt,
    observed_at: observed,
    payload: { team: "Boston", player: "Sample Guard", status: "Out" },
  };
  const games = [
    { id: "game-a", slug: "a", away_team: "Boston", home_team: "Detroit" },
    { id: "game-b", slug: "b", away_team: "Miami", home_team: "Atlanta" },
  ];
  const kickoff = new Date(+start + 24 * hour).toISOString();
  let nbaRows = [
    injury,
    {
      ...injury,
      id: "other-game",
      game_id: "game-b",
      payload: { team: "Miami", player: "Other Player", status: "Out" },
    },
    {
      ...injury,
      id: "too-old",
      recorded_at: new Date(+start - 8 * 24 * hour).toISOString(),
      payload: { team: "Boston", player: "Expired Player", status: "Out" },
    },
  ];
  let failGameB = false;
  const injuryQueries: {
    table: string;
    game: string;
    since: string;
    limit: number;
    order: string[];
  }[] = [];
  t.mock.method(supabase, "from", (table: string) => {
    const filters = new Map<string, unknown>();
    const order: string[] = [];
    let max = 0;
    const chain = {
      select: () => chain,
      eq: (name: string, value: string) => {
        filters.set(name, value);
        return chain;
      },
      in: (name: string, value: string[]) => {
        filters.set(name, value);
        return chain;
      },
      gte: (name: string, value: string) => {
        filters.set(name, value);
        return chain;
      },
      lt: () => chain,
      order: (name: string, options?: { ascending?: boolean }) => {
        order.push(name + ":" + options?.ascending);
        return chain;
      },
      limit: (n: number) => {
        max = n;
        return chain;
      },
      then: (resolve: (r: { data: unknown[]; error: unknown }) => void) => {
        let data: unknown[] = [];
        let error: unknown = null;
        if (table === "nba_games")
          data = games.map((g) => ({ ...g, tipoff: kickoff }));
        if (table === "games") data = [{ ...games[0], kickoff }];
        if (filters.get("kind") === "injury") {
          const game = String(filters.get("game_id"));
          const since = String(filters.get("recorded_at"));
          injuryQueries.push({ table, game, since, limit: max, order });
          if (table === "nba_observations") {
            data = nbaRows
              .filter((row) => row.game_id === game && row.recorded_at >= since)
              .sort(
                (a, b) =>
                  b.recorded_at.localeCompare(a.recorded_at) ||
                  b.id.localeCompare(a.id),
              )
              .slice(0, max);
            if (failGameB && game === "game-b") error = { message: "offline" };
          }
        }
        return Promise.resolve({ data, error }).then(resolve);
      },
    };
    return chain;
  });

  const search = (
    r: Awaited<ReturnType<typeof readResearchHub>>,
    player: string,
    sport = "nba",
  ) =>
    filterEvents(
      r.events,
      r.findings,
      hubFilters(new URLSearchParams({ sport, topic: "injuries", q: player })),
    ).map((e) => e.key);
  const early = await readResearchHub();
  assert.deepEqual(search(early, "Sample Guard"), ["nba:game-a"]);
  assert.equal(
    early.findings.find((f) => f.id === injury.id)?.title,
    "Reported availability",
  );
  assert.deepEqual(search(early, "Sample Guard", "nfl"), []);
  assert.deepEqual(search(early, "Other Player"), ["nba:game-b"]);
  assert.deepEqual(search(early, "Expired Player"), []);

  t.mock.timers.tick(2 * hour);
  for (let i = 0; i < 2; i++) {
    const later = await readResearchHub();
    assert.deepEqual(search(later, "Sample Guard"), ["nba:game-a"]);
    const retained = later.findings.find((f) => f.id === injury.id);
    assert.equal(retained?.title, "Older reported availability");
    assert.equal(retained?.recordedAt, receipt);
    assert.equal(retained?.sourceAt, observed);
    assert.deepEqual(retained?.sources, [injury.source]);
  }

  failGameB = true;
  nbaRows = [
    ...nbaRows,
    {
      ...injury,
      id: "newer",
      provider: "Provider B",
      recorded_at: new Date().toISOString(),
      payload: { ...injury.payload, status: "Available" },
    },
    {
      ...injury,
      id: "missing-player",
      payload: { team: "Boston", player: "", status: "Out" },
    },
    ...Array.from({ length: 100 }, (_, i) => ({
      ...injury,
      id: `extra-${i}`,
      payload: { team: "Boston", player: `Player ${i}`, status: "Out" },
    })),
  ];
  const latest = await readResearchHub();
  assert.deepEqual(search(latest, "Sample Guard"), ["nba:game-a"]);
  assert.deepEqual(search(latest, "Other Player"), []);
  assert.equal(
    latest.findings.some((f) => f.id === injury.id),
    false,
  );
  assert.match(
    latest.findings.find((f) => f.id === "newer")?.text || "",
    /Available/,
  );
  assert.equal(
    latest.findings.some((f) => f.id === "missing-player"),
    false,
  );
  assert.match(latest.errors.join(" "), /NBA injury reports are incomplete/);
  assert.equal(latest.truncated, true);
  assert.equal(injuryQueries.length, 12);
  assert.ok(
    injuryQueries.every(
      (q) =>
        q.limit === 101 &&
        q.since >= new Date(+start - 7 * 24 * hour).toISOString() &&
        q.order.join() === "recorded_at:false,id:false" &&
        (q.table === "nba_observations"
          ? ["game-a", "game-b"].includes(q.game)
          : q.table === "source_observations" && q.game === "game-a"),
    ),
  );
});

test("tester-only Research uses scoped projections and leaves raw member tables alone", async (t) => {
  const now = new Date("2026-11-07T16:00:00Z");
  t.mock.timers.enable({ apis: ["Date"], now });
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: { user: { id: "tester" } } },
    error: null,
  }));
  const requested: string[] = [];
  t.mock.method(
    supabase,
    "rpc",
    async (name: string, args: Record<string, string>) => {
      if (name === "membership_status")
        return { data: { allowed: false }, error: null };
      if (name === "tester_feature_access")
        return { data: args.p_feature === "research", error: null };
      if (name === "sports_slate")
        return {
          data: { version: 1, sport: args.p_sport, games: [], access: false },
          error: null,
        };
      assert.equal(name, "tester_observation_page");
      assert.equal(args.p_feature, "research");
      assert.equal(args.p_game, "nba-game");
      requested.push(args.p_section);
      return {
        data:
          args.p_section === "injury"
            ? [
                {
                  id: "reported",
                  game_id: "nba-game",
                  kind: "injury",
                  provider: "Fixture",
                  source: "https://example.com/report",
                  observed_at: "2026-11-04T16:00:00Z",
                  recorded_at: "2026-11-04T16:00:00Z",
                  payload: {
                    team: "Boston",
                    player: "Tester Guard",
                    status: "Out",
                  },
                },
              ]
            : [],
        error: null,
      };
    },
  );
  t.mock.method(supabase, "from", (table: string) => {
    assert.ok(
      ["games", "nba_games"].includes(table),
      `protected table called: ${table}`,
    );
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: async () => ({
        data:
          table === "games"
            ? []
            : [
                {
                  id: "nba-game",
                  slug: "test",
                  away_team: "Boston",
                  home_team: "Detroit",
                  tipoff: "2026-11-08T00:00:00Z",
                  tipoff_tbd: false,
                  status: "STATUS_SCHEDULED",
                },
              ],
        error: null,
      }),
    };
    return chain;
  });
  const result = await readResearchHub();
  assert.equal(result.denied, false);
  assert.deepEqual(requested.sort(), ["injury", "quotes"]);
  assert.equal(result.findings[0].title, "Older reported availability");
  assert.match(result.findings[0].text, /Current status is unverified/);
});

test("a chosen topic keeps every event but lists events with that topic's reports first", () => {
  const early = {
    ...event,
    key: "nba:early",
    id: "early",
    start: "2026-11-06T23:00:00Z",
  };
  const late = {
    ...event,
    key: "nba:late",
    id: "late",
    start: "2026-11-07T02:00:00Z",
  };
  const f = hubFilters(new URLSearchParams("sport=nba&topic=injuries"));
  const lateInjury = { ...finding, id: "late-injury", eventKey: late.key };
  assert.deepEqual(
    filterEvents([early, event, late], [lateInjury, finding], f).map(
      (e) => e.key,
    ),
    [event.key, late.key, early.key],
  );
  assert.deepEqual(
    filterEvents([early, event, late], [lateInjury, finding], {
      ...f,
      topic: "all",
    }).map((e) => e.key),
    [early.key, event.key, late.key],
  );
});
test("partial-coverage notices follow the selected sport", () => {
  const errors = [
    "NCAAB schedule or research source unavailable. Retry to check this sport.",
    "NHL schedule or research source unavailable. Retry to check this sport.",
    "Membership status unavailable.",
    "Some NFL research sources could not load. Available sections are partial; retry.",
  ];
  assert.deepEqual(sportErrors(errors, "nfl"), [errors[2], errors[3]]);
  assert.deepEqual(sportErrors(errors, "nhl"), [errors[1], errors[2]]);
  assert.deepEqual(sportErrors(errors, "all"), errors);
});

test("search explains what matched: report lines name their section, teams come first", () => {
  const vikings = {
    ...event,
    key: "nfl:min-det",
    id: "min-det",
    sport: "nfl" as const,
    away: "Minnesota Vikings",
    home: "Detroit Lions",
  };
  const report = {
    ...finding,
    id: "inj-min",
    eventKey: vikings.key,
    title: "Reported availability",
    text: "Minnesota Vikings · Justin Jefferson: Questionable\nDetroit Lions · Someone Else: Out",
  };
  const f = hubFilters(new URLSearchParams("q=jefferson"));
  assert.deepEqual(
    searchHits([event, vikings], [finding, report], f).map((h) => [
      h.event.key,
      h.topic,
      h.line,
    ]),
    [
      [
        vikings.key,
        "injuries",
        "Minnesota Vikings · Justin Jefferson: Questionable",
      ],
    ],
  );
  const team = searchHits([vikings], [report], { ...f, query: "vikings" });
  assert.equal(team[0].topic, null);
  assert.equal(team[0].line, "Minnesota Vikings at Detroit Lions");
  assert.equal(team[1].topic, "injuries");
  assert.deepEqual(
    searchHits([vikings], [report], { ...f, query: "j" }),
    [],
    "one letter is too short to list",
  );
  assert.deepEqual(
    searchHits([vikings], [report], { ...f, sport: "nba" }),
    [],
    "sport filter applies",
  );
});

test("long report lines are shortened around the match, never cutting it out", () => {
  const long =
    "Lorem ipsum ".repeat(30) +
    "Justin Jefferson is questionable with a hamstring " +
    "dolor sit ".repeat(30);
  const s = snippet(long, "jefferson");
  assert.match(s, /Justin Jefferson/);
  assert.ok(s.length <= 142, String(s.length));
  assert.ok(s.startsWith("…") && s.endsWith("…"));
  assert.equal(snippet("short line", "line"), "short line");
  assert.ok(
    snippet("Jefferson " + "x".repeat(300), "jefferson").startsWith(
      "Jefferson",
    ),
  );
});
