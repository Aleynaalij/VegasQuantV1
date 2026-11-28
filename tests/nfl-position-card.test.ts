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
const averagesId = "01278216-36d0-b3ac-6487-bc6c15dbb2c5";
const averagesGame = {
  away_team: "Green Bay Packers",
  home_team: "Los Angeles Rams",
  kickoff: "2026-11-26T01:00:00+00:00",
};
const averagesBody = `Green Bay Packers @ Los Angeles Rams · Wed Nov 25, 8:00 PM ET · SoFi Stadium.
Checked Nov 24, 12:02 PM ET. 2026 REG Weeks 1–10 for both clubs; 10 games per defense. Research only.

DEFENSE VS POSITION | ALLOWED PER GAME
GB: WR 21.7 targets / 14.0 catches / 155.9 yards; RB 94.5 rush yards / 32.3 receiving yards; TE 41.2 receiving yards; QB 229.4 pass yards.
LAR: WR 15.1 targets / 8.7 catches / 111.3 yards; RB 72.6 rush yards / 39.2 receiving yards; TE 47.1 receiving yards; QB 197.7 pass yards.

Latest recorded team game: Week 10. Green Bay recorded 29 pass attempts; Los Angeles 26. Corum carried 17 times for 100 yards, Williams 12 for 23. One game does not establish the next workload.

Sources:
https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv
Game 01e5f386-804c-44c8-baf7-155f85db1ae1`;

test("Packers–Rams publication converts only the seven explicit averages per defense", () => {
  const p = positionCardPayload({ body: averagesBody, game: averagesGame });
  assert.ok(p?.averages);
  assert.equal(p.day, "2026-11-25");
  assert.equal(p.throughWeek, 10);
  assert.equal(p.averages.season, "2026");
  assert.equal(p.averages.checked, "Nov 24, 12:02 PM ET");
  assert.equal(p.averages.sampleGames, 10);
  assert.equal(p.games[0].awayAbbr, "GB");
  assert.equal(p.games[0].homeAbbr, "LA");
  assert.equal(p.averages.homeLabel, "LAR");
  assert.deepEqual(p.games[0].lines, []);
  assert.deepEqual(
    p.averages.rows.map((r) => [r.label, r.away, r.home]),
    [
      ["WR targets", "21.7", "15.1"],
      ["WR catches", "14.0", "8.7"],
      ["WR yards", "155.9", "111.3"],
      ["RB rush yards", "94.5", "72.6"],
      ["RB receiving yards", "32.3", "39.2"],
      ["TE receiving yards", "41.2", "47.1"],
      ["QB pass yards", "229.4", "197.7"],
    ],
  );
  assert.equal(positionCardPayload({ body, game })?.averages, undefined);
});

test("unsupported averages retain the text fallback, never invent or guess values", () => {
  for (const body of [
    averagesBody.replace("Weeks 1–10", "Weeks 2–10"),
    averagesBody.replace("10 games per defense", "11 games per defense"),
    averagesBody.replace("GB: WR", "SEA: WR"),
    averagesBody.replace("LAR: WR", "GB: WR"),
    averagesBody.replace("21.7 targets", "unknown targets"),
    averagesBody.replace("229.4 pass yards.", "229.4 pass yards; QB 8 sacks."),
    averagesBody.replace("ALLOWED PER GAME", "UNSUPPORTED"),
    averagesBody.replace(
      "197.7 pass yards.\n\n",
      "197.7 pass yards.\nSEA: 99 arbitrary yards.\n\n",
    ),
  ])
    assert.equal(positionCardPayload({ body, game: averagesGame }), null);
});

test("the Zone image entry point renders the averages and retained ranked formats as PNG", async (t) => {
  const originalFetch = globalThis.fetch;
  // No service calls. Vercel OG's bundled WebAssembly assets use data URLs.
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.protocol === "data:") return originalFetch(input, init);
      assert.equal(init?.method, "POST");
      const params = JSON.parse(String(init?.body));
      if (url.pathname === "/rest/v1/rpc/nfl_position_card") {
        return Response.json(
          params.p_post === averagesId
            ? { body: averagesBody, game: averagesGame }
            : params.p_post === id
              ? { body, game }
              : {
                  body: averagesBody.replace("21.7 targets", "unknown targets"),
                  game: averagesGame,
                },
        );
      }
      assert.equal(url.pathname, "/rest/v1/rpc/nfl_weekly_card");
      assert.deepEqual(params, { p_card: "nfl-dvp:2026-11-15:1" });
      return Response.json(positionCardPayload({ body, game }));
    },
  );
  const { GET } = await import("../src/app/api/nfl/weekly-card/[card]/route");
  const get = (card: string) =>
    GET(new Request(`http://127.0.0.1/api/nfl/weekly-card/${card}`), {
      params: Promise.resolve({ card }),
    });
  for (const card of [
    `post-${averagesId}`,
    `post-${id}`,
    "nfl-dvp:2026-11-15:1",
  ]) {
    const result = await get(card);
    assert.equal(result.status, 200, card);
    assert.equal(result.headers.get("Content-Type"), "image/png", card);
    const png = Buffer.from(await result.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", card);
    assert.equal(png.readUInt32BE(16), 1080, card);
    assert.equal(png.readUInt32BE(20), 1350, card);
  }
  const invalid = await get("post-00000000-0000-0000-0000-000000000000");
  assert.equal(invalid.status, 404);
  assert.equal(invalid.headers.get("Cache-Control"), "no-store");
  assert.equal(await invalid.text(), "No card");
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
