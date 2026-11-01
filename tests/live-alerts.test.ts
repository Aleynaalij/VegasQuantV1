import test from "node:test";
import assert from "node:assert/strict";
import { planAlerts, type AlertCandidate } from "../src/lib/live-alerts";
import type { LiveGame } from "../src/lib/live-scores";

const g = (
  id: string,
  state: LiveGame["state"],
  a: number,
  h: number,
): LiveGame => ({
  id,
  start: "2026-11-01T00:00:00Z",
  state,
  detail: state === "post" ? "Final" : "Q3 4:12",
  away: { name: "Utah Jazz", abbreviation: "UTA", score: a },
  home: { name: "Portland Trail Blazers", abbreviation: "POR", score: h },
});
const c = (p: Partial<AlertCandidate>): AlertCandidate => ({
  sport: "nba",
  id: "p",
  provider_id: "1",
  slug: "uta-por-1",
  market: "player_points",
  side: null,
  direction: "Over",
  line: "23.5",
  player: "Deni Avdija",
  supersedes_id: null,
  ...p,
});

test("decided picks alert once with a matchup link; undecided, superseded and unreadable ones wait", async () => {
  const boxReads: string[] = [];
  const plan = await planAlerts(
    [
      c({ id: "old", line: "26.5" }),
      c({ id: "new", line: "23.5", supersedes_id: "old" }),
      c({ id: "reb", market: "player_rebounds", line: "9.5" }),
      c({
        id: "ml",
        sport: "nhl",
        provider_id: "9",
        slug: "bos-tor-9",
        market: "h2h",
        side: "home",
        direction: null,
        line: null,
        player: null,
      }),
      c({ id: "nobox", provider_id: "2", slug: "mia-orl-2" }),
      c({ id: "pre", provider_id: "3", slug: "x-y-3" }),
    ],
    async (sport) =>
      sport === "nba"
        ? [g("1", "in", 70, 74), g("2", "in", 40, 41), g("3", "pre", 0, 0)]
        : [
            {
              ...g("9", "post", 2, 3),
              away: { name: "Boston Bruins", abbreviation: "BOS", score: 2 },
              home: {
                name: "Toronto Maple Leafs",
                abbreviation: "TOR",
                score: 3,
              },
            },
          ],
    async (sport, id) => {
      boxReads.push(`${sport}:${id}`);
      if (id === "2") return null;
      return {
        players: { "deni avdija": { points: 25, rebounds: 7 } },
        final: false,
      };
    },
  );
  assert.deepEqual(
    plan.map((p) => [p.pick, p.link]),
    [
      ["new", "/nba/games/uta-por-1"],
      ["ml", "/nhl/games/bos-tor-9"],
    ],
  );
  assert.match(
    plan[0].message,
    /^Avdija O 23\.5 PTS cleared \(UTA 70, POR 74, Q3 4:12\): 25 PTS, cleared\.$/,
  );
  assert.match(
    plan[1].message,
    /^Final \(BOS 2, TOR 3\): our TOR to win hit, won\./,
  );
  assert.deepEqual(
    boxReads.sort(),
    ["nba:1", "nba:2"],
    "one box read per game, none for game lines",
  );
});

test("a scoreboard outage plans nothing rather than guessing", async () => {
  const plan = await planAlerts(
    [c({})],
    async () => {
      throw Error("down");
    },
    async () => ({ players: {}, final: false }),
  );
  assert.deepEqual(plan, []);
});

test("a final game's prop alert waits for a box ESPN marks final", async () => {
  const cand = [c({ id: "u", direction: "Under", line: "20.5" })];
  const games = async () => [g("1", "post", 98, 101)];
  const live = await planAlerts(cand, games, async () => ({
    players: { "deni avdija": { points: 18 } },
    final: false,
  }));
  assert.deepEqual(live, [], "a lagging live box never decides a final");
  const final = await planAlerts(cand, games, async () => ({
    players: { "deni avdija": { points: 22 } },
    final: true,
  }));
  assert.match(
    final[0].message,
    /^Final \(UTA 98, POR 101\): our Avdija U 20\.5 PTS missed, 22 PTS, over the line\./,
  );
});
