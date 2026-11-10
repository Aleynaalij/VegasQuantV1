import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  positionCardPayload,
  positionCardPostId,
} from "../src/lib/nfl-position-card";
const id = "62fddd67-c335-1d23-e28f-f2a0c5c71166";
const game = {
  away_team: "Washington Commanders",
  home_team: "New York Giants",
  kickoff: "2026-11-13T01:15:00Z",
};
const body =
  "2026 REG through Week 9\nWASHINGTON ALLOWS\n#2 completions to QB — 24.13/game\nNEW YORK ALLOWS\n#1 rushing TDs to QB — 0.38/game";
test("off-cycle DvP uses the existing native image path, without changing ordinary publications", () => {
  const p = {
    id,
    sport: "nfl",
    card: "vq-publication:v1",
    title: "Defense vs Position · Commanders @ Giants",
    legs: [],
  };
  assert.equal(positionCardPostId(p), id);
  assert.equal(positionCardPostId({ ...p, legs: ["a pick"] }), null);
  assert.equal(positionCardPostId({ ...p, sport: "nba" }), null);
  assert.equal(positionCardPostId({ ...p, title: "NFL WR Matchups" }), null);
});
test("the exact source ranks become native DvP lines, not projections", () => {
  const p = positionCardPayload({ body, game });
  assert.ok(p);
  assert.equal(p.day, "2026-11-12");
  assert.equal(p.throughWeek, 9);
  assert.deepEqual(
    p.games[0].lines.map((l) => l.text),
    [
      "COMMANDERS ALLOW 2ND MOST COMPLETIONS TO QB",
      "GIANTS ALLOW MOST RUSH TDS TO QB",
    ],
  );
  for (const invalid of [
    body.replace("#2", "#20"),
    body.replace("completions", "made-up stat"),
    body + "\n#2 passing yards to QB — ??/game",
  ])
    assert.equal(positionCardPayload({ body: invalid, game }), null);
  assert.equal(positionCardPayload(null), null);
});
test("Thursday reuses the original Frame/DvpBody/font/palette and Sunday remains separate", () => {
  const route = readFileSync(
    "src/app/api/nfl/weekly-card/[card]/route.tsx",
    "utf8",
  );
  assert.match(route, /positionCardPayload\(r.data\)/);
  assert.match(route, /<DvpBody card=\{data as DvpCard\} single=\{!!post\}/);
  assert.match(route, /SUNDAY & MONDAY GAMES/);
  assert.match(route, /THURSDAY NIGHT/);
  const feed = readFileSync("src/components/community-feed.tsx", "utf8");
  assert.match(feed, /weeklyCardRef\(p.card\) \|\| positionCardPostId\(p\)/);
});

test("the public image projection excludes member posts, picks, stakes and hidden publishers", async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["tests/sql/nfl-position-card.mjs"], {
    timeout: 60000,
    stdio: "pipe",
  });
});
