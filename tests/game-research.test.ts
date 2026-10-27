import test from "node:test";
import assert from "node:assert/strict";
import {
  gameResearchTopics,
  footballNews,
  memberResearchText,
  publicationSources,
  type GameNewsRow,
} from "../src/lib/game-research";
import type { Analysis } from "../src/lib/domain";
const version = (n: number, sections: Record<string, string>): Analysis => ({
  id: `a${n}`,
  game_id: "game",
  version: n,
  title: `Update ${n}`,
  sections,
  projections: { true_spread: "Private unsupported model output" },
  raw_handoff: "private",
  source: "VQ",
  created_at: `2026-10-${10 + n}T12:00:00Z`,
});
const history = [
  version(3, {
    "Game Summary":
      "Houston at Jacksonville · 2026-10-18T13:30:00Z. Material pregame research update observed now.",
    Weather: "Rain risk increased to 60%.",
    "Edge Analysis":
      "No approved priced model is registered. SHADOW_ONLY output is not validated EV.",
  }),
  version(2, {
    "Game Summary":
      "Marks saw more carries last week; the receiver rotation changed after the trade.",
    Injuries: "Montgomery was ruled out on Friday.",
    "Defensive Matchups":
      "The replacement left tackle changes the protection matchup.",
    "Workload facts": "Marks: W4 6 carries\\nTuten: W4 17 carries",
    Sources: "https://example.com/team-report",
  }),
  version(1, {
    Weather: "Earlier forecast: 30% rain.",
    Injuries: "Montgomery was questionable on Wednesday.",
  }),
];
test("a weather-only update retains the newest actual matchup and injury topics with their own dates", () => {
  const topics = gameResearchTopics(history, 3);
  assert.match(
    topics.find((t) => t.id === "overview")!.items[0].text,
    /receiver rotation/,
  );
  const injuries = topics.find((t) => t.id === "injuries")!.items[0];
  assert.equal(injuries.version, 2);
  assert.equal(injuries.at, history[1].created_at);
  assert.match(injuries.text, /ruled out/);
  assert.match(
    topics.find((t) => t.id === "matchup")!.items[0].text,
    /left tackle/,
  );
  assert.match(topics.find((t) => t.id === "weather")!.items[0].text, /60%/);
  assert.doesNotMatch(
    JSON.stringify(topics),
    /SHADOW_ONLY|Private unsupported|Material pregame/,
  );
});
test("historical selection never pulls future injury or weather updates", () => {
  const topics = gameResearchTopics(history, 1);
  assert.match(
    topics.find((t) => t.id === "injuries")!.items[0].text,
    /questionable/,
  );
  assert.match(topics.find((t) => t.id === "weather")!.items[0].text, /30%/);
  assert.doesNotMatch(
    JSON.stringify(topics),
    /ruled out|60%|receiver rotation/,
  );
});
test("workload line breaks and football risks survive operational text removal", () => {
  assert.equal(
    memberResearchText(
      "Marks had 15 carries. R7 restricts publication. Opportunity is not guaranteed.",
    ),
    "Marks had 15 carries. Opportunity is not guaranteed.",
  );
  assert.equal(
    gameResearchTopics(history, 3)
      .find((t) => t.id === "players")!
      .items[0].text.split("\n").length,
    2,
  );
});
test("weekly football news excludes pipeline coverage and duplicate posts", () => {
  const row: GameNewsRow = {
    id: "news",
    title: "Harrison traded to Houston",
    summary: "Houston confirmed the receiver trade.",
    why_watch: "Receiving shares may change.",
    caution: "Roles remain uncertain.",
    source_url: "https://example.com/team",
    source_at: "2026-10-12T12:00Z",
    created_at: "2026-10-12T12:01Z",
  };
  const rows = footballNews([
    row,
    { ...row, id: "duplicate" },
    {
      ...row,
      id: "pipeline",
      title: "Sunday coverage · props visible",
      source_url:
        "https://github.com/org/repo/research/probability/qualification.md",
    },
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["news"],
  );
});
test("malformed publication links cannot crash the briefing", () => {
  assert.deepEqual(
    publicationSources(
      version(1, {
        Sources:
          "https://[bad https://example.com/report\\nhttps://example.com/report",
      }),
    ),
    ["https://example.com/report"],
  );
});
test("new team-form statistics join the overview without replacing the football summary", () => {
  const form = version(4, {
    "Team form":
      "Sample away: 250 gross passing yards/game.\nSample home: 130 rushing yards/game.",
  });
  const topics = gameResearchTopics([form, ...history], 4);
  assert.equal(topics.find((t) => t.id === "overview")!.items.length, 2);
  assert.match(
    topics.find((t) => t.id === "overview")!.items[0].text,
    /receiver rotation/,
  );
  assert.match(topics.find((t) => t.id === "form")!.items[0].text, /250/);
  assert.equal(topics.find((t) => t.id === "form")!.items[0].version, 4);
});

test("newer availability supersedes older injuries, while historical views retain their cutoff", () => {
  const versions = [
    version(2, { Availability: "Player cleared on Sunday." }),
    version(1, { Injuries: "Player questionable Friday." }),
  ];
  assert.match(
    gameResearchTopics(versions, 2).find((t) => t.id === "injuries")!.items[0]
      .text,
    /cleared/,
  );
  assert.match(
    gameResearchTopics(versions, 1).find((t) => t.id === "injuries")!.items[0]
      .text,
    /questionable/,
  );
});
test("a newer role update supersedes an older summary", () => {
  const versions = [
    version(2, { "Role update": "New starter confirmed." }),
    version(1, { "Game Summary": "Earlier rotation." }),
  ];
  assert.match(
    gameResearchTopics(versions, 2).find((t) => t.id === "overview")!.items[0]
      .text,
    /New starter/,
  );
});

test("substantive summaries may contain a kickoff timestamp", () => {
  const current = version(4, {
    "Game Summary":
      "Kickoff 2026-10-18T13:30:00Z. The receiver rotation changed Sunday.",
  });
  assert.match(
    gameResearchTopics([current, ...history], 4).find(
      (t) => t.id === "overview",
    )!.items[0].text,
    /changed Sunday/,
  );
});

test("ordinary football hosting language remains visible", () => {
  assert.equal(
    memberResearchText(
      "Houston hosted Jacksonville last week. The home offense ran 30 times.",
    ),
    "Houston hosted Jacksonville last week. The home offense ran 30 times.",
  );
  assert.equal(
    memberResearchText(
      "A hosted journal stores scanner coverage. Houston hosted Jacksonville last week.",
    ),
    "Houston hosted Jacksonville last week.",
  );
});

test("carried-forward sections keep their original source and date, and do not outrank newly changed aliases", () => {
  const first = version(1, {
    Injuries: "Questionable Friday.",
    "Game Summary": "Earlier rotation.",
    Sources: "https://example.com/friday",
  });
  const second = version(2, {
    ...first.sections,
    Availability: "Cleared Sunday.",
    "Role update": "New starter Sunday.",
    Sources: "https://example.com/sunday",
  });
  const third = version(3, { ...second.sections });
  const topics = gameResearchTopics([third, second, first], 3);
  assert.equal(topics.find((t) => t.id === "injuries")!.items[0].version, 2);
  assert.match(
    topics.find((t) => t.id === "injuries")!.items[0].text,
    /Cleared/,
  );
  assert.match(
    topics.find((t) => t.id === "overview")!.items[0].text,
    /New starter/,
  );
  const carried = gameResearchTopics(
    [
      version(2, { ...first.sections, Sources: "https://example.com/new" }),
      first,
    ],
    2,
  ).find((t) => t.id === "injuries")!.items[0];
  assert.equal(carried.at, first.created_at);
  assert.deepEqual(carried.sources, ["https://example.com/friday"]);
});
