import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gameZonePosts,
  zonePostHref,
  zonePostLead,
} from "../src/lib/game-zone-posts";

const row = {
  id: "62fddd67-c335-1d23-e28f-f2a0c5c71166",
  sport: "nfl",
  kind: "talk",
  title: "Defense vs Position · Commanders @ Giants · Thursday Nov 12",
  body: "WASHINGTON ALLOWS",
  legs: [],
  card: "vq-publication:v1",
  photo_path: null,
  author_name: "TheDealer",
  created_at: "2026-11-10T23:30:37Z",
  reactions: 2,
  comments: 1,
};

test("reader rows are validated; malformed rows are dropped", () => {
  assert.deepEqual(gameZonePosts([row]), [row]);
  assert.deepEqual(gameZonePosts(null), []);
  assert.deepEqual(gameZonePosts({ id: "x" }), []);
  assert.equal(gameZonePosts([row, { ...row, id: 5 }, { ...row, body: null }]).length, 1);
  const loose = gameZonePosts([{ ...row, legs: ["a", 3], reactions: "4", card: 7 }])[0];
  assert.deepEqual([loose.legs, loose.reactions, loose.card], [["a"], 4, null]);
});

test("a tagged post links to its own page in The Zone", () => {
  assert.equal(
    zonePostHref(row),
    `/community?sport=nfl&post=${row.id}#post-${row.id}`,
  );
});

test("leads drop links and cut on a word", () => {
  assert.equal(zonePostLead("Short text https://example.com/x"), "Short text");
  const long = zonePostLead("word ".repeat(200));
  assert.ok(long.length <= 321 && long.endsWith("…") && !long.includes("  "));
});

test("every sport's matchup page mounts the Zone section with its own game id", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  assert.match(read("src/components/matchup-intelligence.tsx"), /<GameZonePosts[^>]*sport="nfl"\s+gameId=\{row\.game\.id\}/);
  assert.match(read("src/components/nba-game-detail.tsx"), /<GameZonePosts[^>]*sport="nba"\s+gameId=\{game\.id\}/);
  assert.match(read("src/components/sport/sport-game.tsx"), /<GameZonePosts[^>]*sport=\{sport\}\s+gameId=\{raw\.id\}/);
});

test("the NFL chip names its sport inside The Zone, and the NFL desk has no VQ Tonight", () => {
  assert.match(readFileSync("src/components/ui.tsx", "utf8"), /community: "\/community\?sport=nfl"/);
  assert.doesNotMatch(readFileSync("src/components/desk.tsx", "utf8"), /VqTonight/);
});
