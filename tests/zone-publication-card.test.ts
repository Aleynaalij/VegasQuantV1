import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import research from "./fixtures/research-publication.json";
import {
  AUTOMATED_CARD,
  isPublicationCard,
  publicationCopy,
  publicationLayout,
  wrapCardText,
} from "../src/lib/zone-publication-card";
const post = {
  id: "fixture",
  sport: "nba",
  title: "Stored selection",
  body:
    "Original text.\n\nRisk: uncertain.\n\nhttps://example.com/" +
    "W".repeat(1200),
  legs: ["Player Over 6.5 rebounds (+124)"],
  created_at: "2026-10-31T16:00:00Z",
  card: AUTOMATED_CARD,
};
test("pick cards exclude analysis and copy only explicit legs", () => {
  assert.equal(isPublicationCard(post), true);
  assert.equal(isPublicationCard({ ...post, card: null }), false);
  assert.equal(isPublicationCard({ ...post, sport: "fake" }), false);
  const card = publicationLayout(post);
  assert.ok(card.height < 900);
  assert.equal(
    card.rows
      .map((row) => row.text)
      .join("")
      .replace(/\s/g, ""),
    post.legs.join("").replace(/\s/g, ""),
  );
  assert.ok(card.rows.every((row) => row.y <= card.height - 170));
  assert.equal(publicationCopy(post), post.title + "\n" + post.legs[0]);
  assert.equal(publicationCopy({ ...post, legs: [] }), "");
  assert.ok(wrapCardText("W".repeat(100), 32).every((l) => l.length <= 29));
});
test("research previews are a bounded single-column excerpt, never a wall of URLs", () => {
  const card = publicationLayout({ ...post, legs: [] });
  assert.equal(card.height, 1350);
  assert.equal(card.research, true);
  assert.match(card.rows.map((row) => row.text).join(" "), /Original text/);
  assert.doesNotMatch(card.rows.map((row) => row.text).join(" "), /https:|WWW/);
  assert.ok(card.rows.every((row) => row.x === 74));
});

test("WR snapshot preserves all five exact lines, both prices, team and observation time", () => {
  const before = JSON.stringify(research);
  const card = publicationLayout(research);
  assert.equal(card.height, 1350);
  assert.equal(card.headline, "WR MATCHUPS");
  assert.equal(card.title.join(" "), "Buffalo Bills @ Minnesota Vikings");
  assert.deepEqual(
    card.rows.filter((row) => row.pick).map((row) => row.text),
    ["75.5", "39.5", "40.5", "24.5", "45.5"],
  );
  const text = card.rows.map((row) => row.text).join(" ");
  for (const name of [
    "Justin Jefferson",
    "Jordan Addison",
    "Khalil Shakir",
    "Keon Coleman",
    "DJ Moore",
  ])
    assert.ok(text.includes(name));
  assert.equal(text.match(/O -113 \/ U -113/g)?.length, 5);
  assert.match(text, /FanDuel receiving-yard snapshots at 1:59 PM ET/);
  assert.doesNotMatch(text, /https:|Recent 3|Jennings/);
  assert.equal(
    JSON.stringify(research),
    before,
    "all original facts and sources remain untouched for the disclosure",
  );
});

test("unrecognized or incomplete snapshot formats fall back without inventing a table", () => {
  for (const body of [
    research.body.replace("1:59 PM ET.", "an unknown time."),
    research.body.replace("U -113", "U missing"),
    research.body.replace("75.5", "123456789.5"),
    research.body.replace(
      "O -113",
      "O -1234567890123456789012345678901234567890",
    ),
    research.body.replace("\nJordan Addison:", " Jordan Addison:"),
    research.body + "\nExtra Receiver: 25.5 rec yds (O -110, U -120).",
    research.body.replace(
      "DJ Moore:",
      "A Very Long Unrecognized Receiver Name:",
    ),
  ])
    assert.equal(
      publicationLayout({ ...research, body }).headline,
      "RESEARCH UPDATE",
    );
  const otherSport = publicationLayout({ ...research, sport: "nba" });
  assert.equal(otherSport.headline, "RESEARCH UPDATE");
  assert.equal(
    publicationLayout({
      ...research,
      title: "NFL WR Matchups · " + "Long team name ".repeat(10),
    }).headline,
    "RESEARCH UPDATE",
  );
});

test("arbitrarily long research, titles and sources stay within one portrait card", () => {
  for (const body of [
    research.body,
    "Sentence with context. ".repeat(3000),
    "W".repeat(10000),
    "🏈".repeat(3000),
    "https://example.com/" + "W".repeat(10000),
    "",
  ]) {
    const title = "An unusually long research title ".repeat(100);
    const p = { ...research, title, body };
    const card = publicationLayout(p);
    assert.equal(card.height, 1350);
    assert.ok(card.title.length <= 3);
    assert.match(card.title.at(-1)!, /…$/);
    assert.ok(card.rows.length <= 9);
    assert.ok(card.rows.every((row) => row.y + (row.size ?? 56) < 1200));
    assert.equal(p.body, body);
    assert.equal(p.title, title);
  }
});

test("NHL pick cards preserve the stored price and timestamp without printing analysis", () => {
  const title = "Golden Knights at Sabres: Golden Knights moneyline";
  const leg = "Vegas Golden Knights moneyline (−113 at FanDuel, 10:37 AM ET)";
  const body = `${leg}\n\nVegas is 11–5–2.\n\nRisk: Starting goalies are not confirmed.`;
  const card = publicationLayout({
    ...post,
    title,
    body,
    sport: "nhl",
    legs: [leg],
  });
  assert.equal(card.rows.map((row) => row.text).join(" "), leg);
  assert.ok(card.height < 900);
});

test("automation markers and legs are attached only by verified server paths", () => {
  const r = spawnSync(
    process.execPath,
    ["tests/sql/zone-automated-cards.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});

test("early watchers pair five stored lines with concerns on one two-column face", async () => {
  const { watcherRows } = await import("../src/lib/zone-publication-card");
  const legs = [
    "Jahmyr Gibbs 15+ receiving yards",
    "Puka Nacua 60+ receiving yards",
    "Zay Flowers 50+ receiving yards",
    "Jaylen Warren 2+ receptions",
    "Brock Bowers 4+ receptions",
  ];
  const headings = [
    "Gibbs 15+ receiving yards",
    "Puka 60+ receiving yards",
    "Flowers 50+ receiving yards",
    "Warren 2+ receptions",
    "Bowers 4+ receptions",
  ];
  const body =
    headings
      .map((h) => `${h}\nConcern: Shared work; verify current availability.`)
      .join("\n\n") + "\n\nWatchlist only — not official picks.";
  const p = { ...post, sport: "nfl", title: "VQ early watchers", legs, body };
  const rows = watcherRows(p)!;
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((r) => r.line.join(" ")),
    legs,
  );
  assert.ok(
    rows.every(
      (r) => r.risk.join(" ") === "Shared work; verify current availability.",
    ),
  );
  assert.ok(rows.at(-1)!.y < 1180);
  assert.equal(publicationCopy(p), [p.title, ...legs].join("\n"));
  assert.equal(
    watcherRows({ ...p, body: body.replace("Puka 60+", "Unknown 60+") }),
    null,
  );
  assert.equal(watcherRows(post), null);
});

test("single cards preserve long titles and never turn a publication time into a quote time", async () => {
  const { publicationStamp } = await import("../src/lib/zone-publication-card");
  const title = "Long matchup title ".repeat(100);
  const card = publicationLayout({ ...post, title });
  assert.equal(card.title.join(" "), title.trim());
  assert.ok(card.rows.every((row) => row.y <= card.height - 170));
  assert.ok(publicationStamp(post.created_at).startsWith("Published "));
  assert.equal(publicationStamp("bad"), "Publication time unavailable");
});

test("Dealer picks read down the left column before continuing at the top right", () => {
  const legs = ["Pick A", "Pick B", "Pick C", "Pick D"];
  const card = publicationLayout({
    ...post,
    legs,
    body: legs.join("\n") + "\n\nOriginal notes.",
  });
  const [one, two, three, four] = card.rows;
  assert.deepEqual(
    card.rows.map((row) => row.text),
    ["1. Pick A", "2. Pick B", "3. Pick C", "4. Pick D"],
  );
  assert.equal(one.x, two.x);
  assert.equal(three.x, four.x);
  assert.ok(three.x > one.x);
  assert.equal(one.y, three.y);
  assert.equal(two.y, four.y);
  assert.ok(card.height < 1350);
});

test("single-pick editorial cards show the quote and observation time without analysis", () => {
  const title = "Jeremiah Fears Over 14.5 points";
  const source = "https://example.com/official/injury-report";
  const body = [
    title + " (-112 at FanDuel, observed Nov 08 12:31 PM ET)",
    "Fears started the last five games. ".repeat(10).trim(),
    "Risk: His scoring can vary with shot volume. ".repeat(8).trim(),
    "Unknowns: Starting lineup is not yet confirmed.",
    "Qualitative editorial, not a validated model edge. Observed prices can change.\n" +
      source,
  ].join("\n\n");
  const editorial = { ...post, title, body, legs: [title] };
  const card = publicationLayout(editorial);
  const face = card.rows.map((row) => row.text).join(" ");
  assert.equal(card.editorial, true);
  assert.ok(
    card.height <= 900,
    `Expected a compact face, received ${card.height}`,
  );
  assert.match(face, /-112 at FanDuel/);
  assert.match(face, /Observed Nov 08 12:31 PM ET/);
  assert.doesNotMatch(face, /https:\/\/|Unknowns:|Risk:|Fears started/);
  assert.equal(editorial.body, body);
  assert.equal(
    publicationLayout({
      ...editorial,
      body: body.replace("observed", "published"),
    }).editorial,
    false,
  );
});
