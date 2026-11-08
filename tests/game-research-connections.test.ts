import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (path: string) => readFileSync(new URL(`../src/components/${path}`, import.meta.url), "utf8");

test("NFL matchup mounts the real published prop table independently of written analysis", () => {
  const text = source("matchup-intelligence.tsx");
  assert.match(text, /<HomeGameList key=\{row.game.id\} games=\{\[row.game\]\} focused/);
  assert.ok(text.indexOf("<HomeGameList") < text.indexOf('className="mi-status"'));
  assert.doesNotMatch(text, /<Empty title="Not analyzed yet">/);
  assert.match(text, /playerResearchAllowed &&/);
  assert.match(text, /!selected \|\| current\?\.id === versions\[0\]\?\.id/);
});

test("focused NFL props still use existing published data and expiry constraints", () => {
  const text = source("home-game-list.tsx");
  assert.match(text, /\.from\("published_legs"\)/);
  assert.match(text, /\.in\("game_id", ids.split\(","\)\)/);
  assert.match(text, /\.gt\("expires_at", new Date\(\).toISOString\(\)\)/);
  assert.match(text, /\.is\("result", null\)/);
  assert.match(text, /useState\(focused\)/);
  assert.match(text, /setInterval\(refresh, 60000\)/);
  assert.match(text, /window.addEventListener\("focus", refresh\)/);
  assert.match(text, /setTimeout\(refresh, 0\)/);
  assert.match(text, /if \(focused\) return;/);
});

test("NBA expanded cards retain lineups and share source research with matchup pages", () => {
  const home = source("nba-home.tsx");
  const detail = source("nba-game-detail.tsx");
  assert.match(home, /<NbaLineups/);
  assert.match(home, /<NbaGameDetails key=\{`\$\{researchGame.id\}-\$\{accountVersion\}`\} game=\{researchGame\}/);
  assert.match(home, /researchGame && researchAllowed/);
  assert.match(home, /setResearchAllowed\(false\)/);
  assert.match(detail, /<NbaGameDetails/);
  assert.ok(home.indexOf("<NbaGameDetails") < home.indexOf("Published Vegas Quant selections"));
  assert.match(home, /setPicks\(p.error \? \[\] : currentSelections/);
  assert.doesNotMatch(home, /if \(q.error \|\| p.error\) \{/);
  assert.match(home, /Retry markets and selections/);
  assert.match(home, /\[ids, opened, retry\]/);
  assert.match(source("nba-game-board.tsx"), /showLineups && <NbaLineups/);
});

test("NHL and NCAAB retain the same game-scoped markets in both destinations", () => {
  for (const file of ["sport/sport-desk.tsx", "sport/sport-game.tsx"]) {
    const text = source(file);
    assert.match(text, /<SportMarkets page=/);
    assert.match(text, /gameId=\{/);
    assert.match(text, /sport === "nhl"/);
    assert.match(text, /<NhlGameReport gameId=/);
  }
});
