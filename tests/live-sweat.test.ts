import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveBox, sweat, type SweatPick } from "../src/lib/live-sweat";
import type { LiveGame } from "../src/lib/live-scores";

const game = (
  away: number,
  home: number,
  state: LiveGame["state"] = "in",
): LiveGame => ({
  id: "1",
  start: "2026-11-01T00:00:00Z",
  state,
  detail: "",
  away: { name: "Boston Bruins", abbreviation: "BOS", score: away },
  home: { name: "Toronto Maple Leafs", abbreviation: "TOR", score: home },
});
const teams = { away: "BOS", home: "TOR" };
const pick = (p: Partial<SweatPick>): SweatPick => ({
  id: "p",
  market: "h2h",
  ...p,
});

test("moneyline: leading, trailing, tied, then won or lost at the final", () => {
  const ml = pick({ side: "home" });
  assert.deepEqual(sweat(ml, game(1, 3), null, teams), {
    state: "ahead",
    label: "TOR to win",
    detail: "leading by 2",
  });
  assert.equal(sweat(ml, game(2, 1), null, teams)!.detail, "trailing by 1");
  assert.equal(sweat(ml, game(2, 2), null, teams)!.state, "even");
  assert.equal(sweat(ml, game(2, 3, "post"), null, teams)!.state, "hit");
  assert.equal(sweat(ml, game(4, 3, "post"), null, teams)!.state, "miss");
  assert.equal(
    sweat(
      ml,
      { ...game(0, 0, "pre"), away: { ...game(0, 0).away, score: null } },
      null,
      teams,
    ),
    null,
  );
});

test("spread: covering, short, on the number, push at the final", () => {
  const sp = pick({ market: "spreads", side: "away", line: 3.5 });
  assert.equal(sweat(sp, game(70, 72), null, teams)!.detail, "covering by 1.5");
  assert.equal(sweat(sp, game(60, 70), null, teams)!.detail, "short by 6.5");
  const whole = pick({ market: "spreads", side: "home", line: -3 });
  assert.equal(sweat(whole, game(70, 73, "post"), null, teams)!.detail, "push");
});

test("totals: an Over clears and stays cleared; an Under has room or is gone", () => {
  const over = pick({ market: "totals", direction: "Over", line: 6.5 });
  assert.equal(
    sweat(over, game(2, 2), null, teams)!.detail,
    "4 total, needs 3",
  );
  assert.equal(sweat(over, game(4, 3), null, teams)!.state, "hit");
  assert.equal(sweat(over, game(3, 2, "post"), null, teams)!.state, "miss");
  const under = pick({ market: "totals", direction: "Under", line: 6.5 });
  assert.equal(
    sweat(under, game(2, 2), null, teams)!.detail,
    "4 total, 2 to spare",
  );
  assert.equal(
    sweat(under, game(3, 3), null, teams)!.detail,
    "6 total, no room left",
  );
  assert.equal(sweat(under, game(4, 3), null, teams)!.state, "miss");
  const whole = pick({ market: "totals", direction: "Over", line: 6 });
  assert.equal(
    sweat(whole, game(2, 2), null, teams)!.detail,
    "4 total, needs 3",
  );
  assert.equal(
    sweat(whole, game(3, 3, "post"), null, teams)!.detail,
    "6 total, push",
  );
});

test("player props read the live box score; an unknown player is never guessed", () => {
  const nba = parseLiveBox("nba", {
    boxscore: {
      players: [
        {
          statistics: [
            {
              keys: ["minutes", "points", "rebounds"],
              athletes: [
                {
                  athlete: { displayName: "Deni Avdija" },
                  stats: ["28", "18", "7"],
                },
                {
                  athlete: { displayName: "Bench Guy" },
                  didNotPlay: true,
                  stats: [],
                },
              ],
            },
          ],
        },
      ],
    },
  })!;
  const pts = pick({
    market: "player_points",
    player: "Deni Avdija",
    direction: "Over",
    line: 23.5,
  });
  assert.deepEqual(sweat(pts, game(70, 74), nba, teams), {
    state: "behind",
    label: "Avdija O 23.5 PTS",
    detail: "18 PTS, needs 6",
  });
  const reb = pick({
    market: "player_rebounds",
    player: "deni avdija",
    direction: "Under",
    line: 9.5,
  });
  assert.equal(
    sweat(reb, game(70, 74), nba, teams)!.detail,
    "7 REB, 2 to spare",
  );
  assert.equal(
    sweat({ ...pts, player: "Bench Guy" }, game(70, 74), nba, teams),
    null,
    "no stat row, no guess",
  );
  assert.equal(sweat(pts, game(70, 74), null, teams), null);
});

test("NHL box: skaters only, points are goals plus assists, anytime scorer", () => {
  const nhl = parseLiveBox("nhl", {
    boxscore: {
      players: [
        {
          statistics: [
            {
              name: "forwards",
              keys: ["goals", "assists", "timeOnIce"],
              athletes: [
                {
                  athlete: { displayName: "David Pastrnak" },
                  stats: ["1", "1", "14:02"],
                },
              ],
            },
            {
              name: "goalies",
              keys: ["goals", "assists", "saves"],
              athletes: [
                {
                  athlete: { displayName: "Jeremy Swayman" },
                  stats: ["0", "1", "20"],
                },
              ],
            },
          ],
        },
      ],
    },
  })!;
  assert.equal(
    nhl["jeremy swayman"],
    undefined,
    "goalies are not skater props",
  );
  const pts = pick({
    market: "player_points",
    player: "David Pastrnak",
    direction: "Over",
    line: 0.5,
  });
  assert.deepEqual(sweat(pts, game(2, 1), nhl, teams), {
    state: "hit",
    label: "Pastrnak O 0.5 pts",
    detail: "2 pts, cleared",
  });
  const any = pick({
    market: "player_goal_scorer_anytime",
    player: "David Pastrnak",
    direction: "Yes",
  });
  assert.equal(sweat(any, game(2, 1), nhl, teams)!.state, "hit");
  assert.equal(parseLiveBox("nhl", { nope: 1 }), null);
});

test("a box score counts as final only when ESPN's own summary says so", async () => {
  const { boxIsFinal } = await import("../src/lib/live-sweat");
  assert.equal(
    boxIsFinal({
      header: { competitions: [{ status: { type: { completed: true } } }] },
    }),
    true,
  );
  assert.equal(
    boxIsFinal({
      header: { competitions: [{ status: { type: { completed: false } } }] },
    }),
    false,
  );
  assert.equal(boxIsFinal({}), false);
  assert.equal(boxIsFinal(null), false);
});

test("NHL live box uses the grader's participation rule: no scratched or zero-time skaters", () => {
  const nhl = parseLiveBox("nhl", {
    boxscore: {
      players: [
        {
          statistics: [
            {
              name: "forwards",
              keys: ["goals", "assists", "timeOnIce"],
              athletes: [
                {
                  athlete: { displayName: "Played Guy" },
                  stats: ["0", "0", "12:30"],
                },
                {
                  athlete: { displayName: "Scratched Guy", scratched: true },
                  stats: ["0", "0", "0:00"],
                },
                {
                  athlete: { displayName: "Zero Time" },
                  stats: ["0", "0", "0:00"],
                },
                {
                  athlete: { displayName: "No Clock" },
                  stats: ["0", "0", "--"],
                },
              ],
            },
          ],
        },
      ],
    },
  })!;
  assert.deepEqual(Object.keys(nhl), ["played guy"]);
  const any = pick({
    market: "player_goal_scorer_anytime",
    player: "Zero Time",
    direction: "Yes",
  });
  assert.equal(
    sweat(any, game(2, 3, "post"), nhl, teams),
    null,
    "no Missed for a skater who never played",
  );
  assert.equal(
    sweat({ ...any, player: "Played Guy" }, game(2, 3, "post"), nhl, teams)!
      .state,
    "miss",
  );
});

test("player names match across accents on either side (Jokić / Jokic)", () => {
  const box = parseLiveBox("nba", {
    boxscore: {
      players: [
        {
          statistics: [
            {
              keys: ["points", "rebounds"],
              athletes: [
                {
                  athlete: { displayName: "Nikola Jokić" },
                  stats: ["31", "12"],
                },
              ],
            },
          ],
        },
      ],
    },
  })!;
  const p = pick({
    market: "player_points",
    player: "Nikola Jokic",
    direction: "Over",
    line: 27.5,
  });
  assert.equal(sweat(p, game(90, 95), box, teams)!.state, "hit");
  const other = parseLiveBox("nba", {
    boxscore: {
      players: [
        {
          statistics: [
            {
              keys: ["points", "rebounds"],
              athletes: [
                { athlete: { displayName: "Luka Doncic" }, stats: ["20", "5"] },
              ],
            },
          ],
        },
      ],
    },
  })!;
  assert.equal(
    sweat({ ...p, player: "Luka Dončić" }, game(90, 95), other, teams)!.detail,
    "20 PTS, needs 8",
  );
});
