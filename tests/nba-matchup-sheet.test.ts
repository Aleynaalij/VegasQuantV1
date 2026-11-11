import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nbaMatchupSheetReference,
  nbaSheetAvailability,
} from "../src/lib/nba-matchup-sheet";
import {
  readSheetQuote,
  type SheetGame,
} from "../src/lib/nba-matchup-sheet-server";
import { nbaMatchupSheetSvg } from "../src/lib/nba-matchup-sheet-svg";
import type { PublicationPost } from "../src/lib/zone-publication-card";

const post: PublicationPost = {
  id: "test",
  title: "NBA Matchup Cheat Sheet · New York Knicks @ Cleveland Cavaliers",
  body: "AVAILABILITY · NBA 6:00 AM ET REPORT\nCleveland had not submitted.\n\nMatchup and sources\nhttps://vegasquant.app/nba/games/ny-cle-20261107\nhttps://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-07_06_00AM.pdf",
  sport: "nba",
  legs: [],
  created_at: "2026-11-07T11:00:00Z",
  card: "vq-publication:v1",
};
const game: SheetGame = {
  id: "game",
  provider_id: "123",
  away_team: "New York Knicks",
  home_team: "Cleveland Cavaliers",
  away_abbreviation: "NY",
  home_abbreviation: "CLE",
  tipoff: "2026-11-08T01:00:00Z",
  tipoff_tbd: false,
  venue: "Arena & <Test>",
  season: 2027,
  season_type: 2,
  status: "STATUS_SCHEDULED",
  away_score: null,
  home_score: null,
};

test("only a linked server publication opens the sheet layout", () => {
  assert.deepEqual(nbaMatchupSheetReference(post), { slug: "ny-cle-20261107" });
  for (const changes of [
    { card: null },
    { sport: "nhl" },
    { legs: ["selection"] },
    { title: "NBA picks" },
    { body: post.body.replace("vegasquant.app", "vegasquant.app.example.com") },
  ])
    assert.equal(nbaMatchupSheetReference({ ...post, ...changes }), null);
});

test("an ESPN matchup link can resolve a server publication without its VQ link", () => {
  const body = post.body
    .replace("https://vegasquant.app/nba/games/ny-cle-20261107", "https://www.espn.com/nba/game/_/gameId/401909953")
    .replace("AVAILABILITY · NBA 6:00 AM ET REPORT\n", "Injury report (3:30 PM ET): ");
  assert.deepEqual(nbaMatchupSheetReference({ ...post, body }), { providerId: "401909953" });
  assert.equal(nbaMatchupSheetReference({ ...post, card: null, body }), null);
  assert.equal(nbaMatchupSheetReference({ ...post, body: body.replace("www.espn.com", "www.espn.com.example.org") }), null);
  assert.equal(nbaSheetAvailability(body)?.text, "Cleveland had not submitted.");
});

test("official availability preserves the recorded report and requires its source", () => {
  assert.equal(
    nbaSheetAvailability(post.body)?.text,
    "Cleveland had not submitted.",
  );
  assert.equal(
    nbaSheetAvailability(
      post.body.replace("ak-static.cms.nba.com", "example.com"),
    ),
    null,
  );
});

test("quote is usable only for the exact matchup, market and stored book", () => {
  const payload = {
    book: "FanDuel",
    market: "spreads",
    away_team: game.away_team,
    home_team: game.home_team,
    outcomes: [{ name: game.away_team, price: -110, point: -4.5 }],
  };
  const r = { observed_at: game.tipoff, payload };
  assert.equal(readSheetQuote(r, game, "spreads")?.outcomes[0].point, -4.5);
  assert.equal(readSheetQuote(r, game, "totals"), null);
  assert.equal(
    readSheetQuote(
      { ...r, payload: { ...payload, home_team: "Other" } },
      game,
      "spreads",
    ),
    null,
  );
  assert.equal(
    readSheetQuote(
      { ...r, payload: { ...payload, book: "Other" } },
      game,
      "spreads",
    ),
    null,
  );
});

test("single SVG marks unavailable data and escapes source text", () => {
  const svg = nbaMatchupSheetSvg({
    game,
    cutoff: game.tipoff,
    quotes: {},
    availability: nbaSheetAvailability(post.body),
    teams: [
      { name: game.away_team, code: "NY", logo: null, finals: [], players: [] },
      {
        name: game.home_team,
        code: "CLE",
        logo: null,
        finals: [],
        players: [],
      },
    ],
  });
  assert.equal(svg.match(/<svg /g)?.length, 1);
  assert.match(svg, /Arena &amp; &lt;Test&gt;/);
  assert.match(svg, /No verified quote/);
  assert.match(svg, /Cleveland had not submitted/);
});
