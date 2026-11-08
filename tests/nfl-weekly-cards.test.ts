import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyCards,
  dvpCardText,
  dvpLines,
  ordinal,
  parseCsv,
  teamTable,
  tier,
  weeklyCardRef,
  wrCardText,
  type StatRow,
} from "../src/lib/nfl-weekly-cards";

const TEAMS = ["ATL", "CIN", "DAL", "IND", "NYG", "PHI", "BUF", "MIN"];
/** Week w: each team plays its fixed opponent; `yards[team]` = WR yards it allows per game. */
function season(weeks: number, yards: Record<string, number>): StatRow[] {
  const pairs = [
    ["ATL", "CIN"],
    ["DAL", "IND"],
    ["NYG", "PHI"],
    ["BUF", "MIN"],
  ];
  const rows: StatRow[] = [];
  for (let w = 1; w <= weeks; w++)
    for (const [a, b] of pairs)
      for (const [off, def] of [
        [a, b],
        [b, a],
      ]) {
        const game = `${w}_${a}_${b}`;
        rows.push({
          player_id: `${off}-wr1`,
          player_display_name: `${off} One`,
          position: "WR",
          position_group: "WR",
          season_type: "REG",
          week: String(w),
          game_id: game,
          team: off,
          opponent_team: def,
          targets: "9",
          receptions: "6",
          receiving_yards: String(yards[def]),
          receiving_tds: def === "PHI" ? "1" : "0",
        });
        rows.push({
          player_id: `${off}-wr2`,
          player_display_name: `${off} Two`,
          position: "WR",
          position_group: "WR",
          season_type: "REG",
          week: String(w),
          game_id: game,
          team: off,
          opponent_team: def,
          targets: "5",
          receptions: "3",
          receiving_yards: "20",
          receiving_tds: "0",
        });
        rows.push({
          player_id: `${def}-lb`,
          position: "LB",
          position_group: "LB",
          season_type: "REG",
          week: String(w),
          game_id: game,
          team: def,
          opponent_team: off,
          def_sacks: def === "BUF" ? "4" : "1",
          def_interceptions: "0",
        });
      }
  return rows;
}
const yards = {
  ATL: 60,
  CIN: 80,
  DAL: 100,
  IND: 120,
  NYG: 140,
  PHI: 200,
  BUF: 40,
  MIN: 90,
};
const games = [
  {
    away: "Cincinnati Bengals",
    home: "Atlanta Falcons",
    kickoff: "2026-11-08T18:00:00Z",
  },
  {
    away: "New York Giants",
    home: "Philadelphia Eagles",
    kickoff: "2026-11-08T18:00:00Z",
  },
  {
    away: "Buffalo Bills",
    home: "Minnesota Vikings",
    kickoff: "2026-11-10T01:15:00Z",
  },
];

test("per-game allowed and made tables rank 1 = most, ties share a rank", () => {
  const t = teamTable(season(4, yards));
  assert.equal(t.games.PHI, 4);
  assert.equal(t.value.wr_rec_yds.PHI, 220); // 200 + 20 from the second receiver
  assert.equal(t.rank.wr_rec_yds.PHI, 1);
  assert.equal(t.rank.wr_rec_yds.BUF, 8);
  assert.equal(t.rank.sacks.BUF, 1);
  assert.equal(t.rank.sacks.ATL, 2, "seven teams tie for 2nd");
  assert.equal(ordinal(1), "MOST");
  assert.equal(ordinal(2), "2ND MOST");
  assert.equal(ordinal(13), "13TH MOST");
  assert.equal(ordinal(21), "21ST MOST");
});

test("WR matchups: friendlier defenses score higher, two receivers per team at most, best first", () => {
  const c = buildWeeklyCards("2026-11-08", season(4, yards), games);
  const rows = c.wr.flatMap((x) => x.rows);
  assert.ok(rows.length > 0);
  assert.deepEqual(
    [...rows].sort((a, b) => b.score - a.score),
    rows,
    "sorted best matchup first",
  );
  const nyg = rows.find((r) => r.team === "NYG")!;
  assert.equal(nyg.opponent, "PHI");
  assert.equal(nyg.yardsRank, 1);
  assert.equal(tier(nyg.score), "green");
  assert.equal(
    tier(rows.find((r) => r.team === "MIN")!.score),
    "red",
    "BUF allows the least",
  );
  for (const team of TEAMS)
    assert.ok(rows.filter((r) => r.team === team).length <= 2);
  assert.ok(
    !rows.some((r) => r.team === "DAL"),
    "teams without a Sunday/Monday game are left out",
  );
  assert.match(wrCardText(c.wr[0]), /not a cornerback assignment/);
  assert.ok(wrCardText(c.wr[0]).length <= 2000);
});

test("receivers need 3 games and an appearance in the team's latest game", () => {
  const rows = season(4, yards).filter(
    (r) => !(r.player_id === "NYG-wr1" && r.week === "4"),
  );
  const c = buildWeeklyCards("2026-11-08", rows, games);
  assert.ok(!c.wr.flatMap((x) => x.rows).some((r) => r.player === "NYG One"));
  const short = buildWeeklyCards("2026-11-08", season(2, yards), games);
  assert.equal(short.wr.length, 0);
});

test("defense vs position: 4 games per card, top-8 lines only, both teams represented", () => {
  const c = buildWeeklyCards("2026-11-08", season(4, yards), [
    ...games,
    ...games.slice(0, 2),
  ]);
  assert.deepEqual(
    c.dvp.map((d) => d.games.length),
    [4, 1],
  );
  assert.equal(c.dvp[0].pages, 2);
  const t = teamTable(season(4, yards));
  const lines = dvpLines(t, "NYG", "PHI");
  assert.ok(lines.length <= 10);
  assert.ok(lines.every((l) => l.rank <= 8));
  assert.ok(
    lines.some((l) => l.text === "EAGLES ALLOW MOST RECEIVING YARDS TO WR"),
  );
  assert.ok(dvpCardText(c.dvp[0]).length <= 2000);
});

test("card refs and CSV parsing", () => {
  assert.deepEqual(weeklyCardRef("nfl-dvp:2026-11-08:3"), {
    kind: "dvp",
    day: "2026-11-08",
    page: 3,
  });
  assert.equal(weeklyCardRef("nfl-x:2026-11-08:3"), null);
  assert.equal(weeklyCardRef("nba-threes:2026-11-08"), null);
  assert.deepEqual(parseCsv('a,b,c\n1,"x, ""y""",3\r\n4,5,6\n'), [
    { a: "1", b: 'x, "y"', c: "3" },
    { a: "4", b: "5", c: "6" },
  ]);
});
