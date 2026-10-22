import test from "node:test";
import assert from "node:assert/strict";
import { candidate, type BoardLeg } from "../scripts/research-board/select";
import { ngsContext, type NgsSnapshot } from "../scripts/research-board/ngs";

// Synthetic fixtures only.
const game = {
  id: "g1", provider_id: "401", home_team: "Washington Commanders", away_team: "Buffalo Bills",
  home_abbreviation: "WSH", away_abbreviation: "BUF", kickoff: "2026-10-18T20:25:00Z", season: 2026, week: 7, sport: "NFL",
};
const rec = (player: string, team: string, week: number, sep: number, yacx: number, targets = 8) => ({
  season: "2026", season_type: "REG", week: String(week), player_display_name: player, player_gsis_id: "00-0000001", team_abbr: team,
  avg_separation: String(sep), avg_yac_above_expectation: String(yacx), catch_percentage: "70", percent_share_of_intended_air_yards: "20",
  targets: String(targets), receptions: "6",
});
// League: twelve other receivers at 3 yds separation, +0 YAC over expected.
const league = Array.from({ length: 12 }, (_, i) => rec(`Other ${i}`, "MIA", 1 + (i % 6), 3 + (i % 3) * 0.2, (i % 3) * 0.3));
const receiving: NgsSnapshot = {
  stat_type: "receiving", source_sha256: "a".repeat(64), retrieved_at: "2026-10-17T10:20:00Z",
  rows: [
    ...league,
    rec("Terry McLaurin", "WAS", 3, 9, 9), // outside his last three weeks (4-6)
    rec("Terry McLaurin", "WAS", 5, 1.5, 3, 10),
    rec("Terry McLaurin", "WAS", 6, 2.5, 4, 6),
    rec("Terry McLaurin", "WAS", 7, 9, 9), // the game's own week: never used
    { ...rec("Terry McLaurin", "WAS", 0, 9, 9) }, // season total row: never used
  ],
};
const leg = (player: string, metric: BoardLeg["metric"]) =>
  ({ game, player, metric, threshold: 50, market: "Full game · 50+ receiving yards", price: -180, observedAt: "2026-10-17T10:00:00Z",
    best: null, cleared: 5, sample: 5, median: 70, position: "WR", edge: 30 }) as BoardLeg;

test("NGS context uses only his last three weeks before the game, matched across WSH/WAS", () => {
  const c = ngsContext(leg("Terry McLaurin", "receiving_yards"), [receiving])!;
  assert.deepEqual(c.evidence!.weeks, [5, 6]);
  // Target-weighted: (1.5*10 + 2.5*6) / 16 = 1.875
  assert.equal((c.evidence!.metrics as Record<string, { player: number }>).avg_separation.player, 1.88);
  assert.match(c.why, /^Next Gen Stats, Weeks 5-6: 1\.9 yds separation at the catch point \(league median 3\.\d yds\)/);
  // F1 (low separation) and F3 (YAC over expected) fire, but only as evidence: the holdout found no
  // flag predicts a miss, so they never reach the risk text.
  assert.deepEqual(c.flags, ["F1", "F3"]);
  assert.deepEqual(c.evidence!.flags, ["F1", "F3"]);
});

test("a player under NGS minimums gets no NGS line; unsupported stats get nothing", () => {
  const none = ngsContext(leg("Nobody Here", "receptions"), [receiving])!;
  assert.equal(none.why, "");
  assert.equal(none.evidence, null);
  assert.deepEqual(none.flags, []);
  assert.equal(ngsContext(leg("Terry McLaurin", "def_sacks"), [receiving]), null);
  assert.equal(ngsContext(leg("Terry McLaurin", "rushing_yards"), [receiving]), null, "no rushing snapshot loaded");
});

test("the published leg carries NGS context in why, evidence and sources, never in risk, without changing the selection", () => {
  const l = leg("Terry McLaurin", "receiving_yards");
  const plain = candidate(l);
  const withNgs = candidate(l, ngsContext(l, [receiving]));
  assert.equal(withNgs.odds, plain.odds);
  assert.equal(withNgs.market, plain.market);
  assert.deepEqual(
    { ...withNgs.research_evidence, ngs: null },
    { ...plain.research_evidence, ngs: null },
  );
  assert.ok(withNgs.why.startsWith(plain.why) && /Next Gen Stats/.test(withNgs.why));
  assert.equal(withNgs.risk, plain.risk, "NGS never changes the risk text");
  assert.equal(withNgs.research_evidence.ngs?.stat_type, "receiving");
  assert.equal(withNgs.sources.at(-1)?.url, "https://nextgenstats.nfl.com/");
  assert.equal(plain.sources.length + 1, withNgs.sources.length);
  assert.equal(plain.research_evidence.ngs, null);
});

// Ten defenses over Weeks 1-2: offense team i plays defense team i's partner. BUF allows the least
// separation, MIA the most. Receivers on the offense facing each defense carry that separation.
import { currentTeam, defenseMatchup, type ScheduleGame } from "../scripts/research-board/ngs";
const TEAMS = ["BUF", "MIA", "NE", "NYJ", "KC", "LV", "DEN", "LAC", "DAL", "PHI", "WSH", "NYG"];
const schedule: ScheduleGame[] = [1, 2].flatMap((week) =>
  [0, 2, 4, 6, 8, 10].map((i) => ({ season: 2026, week, away_abbreviation: TEAMS[i], home_abbreviation: TEAMS[i + 1] })));
const allowed: Record<string, number> = { BUF: 1.5, MIA: 4.5, NE: 2.6, NYJ: 2.7, KC: 2.8, LV: 2.9, DEN: 3.0, LAC: 3.1, DAL: 3.2, PHI: 3.3, WSH: 3.4, NYG: 3.5 };
const ngsTeam = (t: string) => (t === "WSH" ? "WAS" : t);
const facing = schedule.flatMap((g) => [
  rec(`vs ${g.home_abbreviation} ${g.week}`, ngsTeam(g.away_abbreviation), g.week, allowed[g.home_abbreviation], 0),
  rec(`vs ${g.away_abbreviation} ${g.week}`, ngsTeam(g.home_abbreviation), g.week, allowed[g.away_abbreviation], 0),
]);

test("matchup: the defense he faces is ranked by what it allowed to his position in earlier weeks", () => {
  const snap: NgsSnapshot = { ...receiving, rows: [...facing, rec("Terry McLaurin", "WAS", 5, 3, 0)] };
  const c = ngsContext({ ...leg("Terry McLaurin", "receiving_yards"), team: "WSH" }, [snap], schedule)!;
  // McLaurin plays for WAS, so in BUF @ WSH he faces BUF: the tightest coverage.
  const d = c.evidence!.defense as { opponent: string; rank: number; defenses: number; allowed: number };
  assert.deepEqual([d.opponent, d.rank, d.defenses, d.allowed], ["BUF", 1, 12, 1.5]);
  assert.match(c.why, /Matchup: BUF allows 1\.5 yds of separation to receivers, 1st lowest of 12 defenses/);
  assert.match(c.why, /: one of the tightest coverages in the league\./);
});

test("matchup: a soft defense is described in the why too; too little data says nothing", () => {
  const soft = defenseMatchup("receiving", facing, schedule, "MIA")!;
  assert.match(soft.why, /12th lowest of 12 defenses .*: one of the softest coverages/);
  assert.equal(defenseMatchup("receiving", facing.filter((r) => r.week === "1"), schedule, "BUF"), null, "one week is not enough");
  assert.equal(defenseMatchup("passing", facing, schedule, "BUF"), null);
  assert.equal(defenseMatchup("receiving", facing, [], "BUF"), null, "no schedule, no matchup");
});

test("matchup: a blank NGS value is missing, not zero separation", () => {
  // MIA faced BUF in Week 1: a MIA receiver row with null separation and 40 targets must not drag BUF toward zero.
  const blank = { ...rec("Blank Row", "MIA", 1, 0, 0, 40), avg_separation: null as unknown as string };
  const withBlank = defenseMatchup("receiving", [...facing, blank], schedule, "BUF")!;
  const without = defenseMatchup("receiving", facing, schedule, "BUF")!;
  assert.deepEqual(withBlank.evidence, without.evidence);
});

test("matchup: his team comes from box scores; a traded player without one gets no matchup line", () => {
  const snap: NgsSnapshot = { ...receiving, rows: [...facing, rec("Terry McLaurin", "BUF", 5, 3, 0)] };
  // His only recent NGS row is with BUF (his former team); box scores say he now plays for WSH.
  const traded = ngsContext({ ...leg("Terry McLaurin", "receiving_yards"), team: "WSH" }, [snap], schedule)!;
  assert.equal((traded.evidence!.defense as { opponent: string }).opponent, "BUF");
  for (const team of [null, undefined, "DAL"]) {
    const c = ngsContext({ ...leg("Terry McLaurin", "receiving_yards"), team }, [snap], schedule)!;
    assert.equal(c.evidence!.defense, null, `team ${team}`);
    assert.doesNotMatch(c.why, /Matchup:/);
  }
  const box = [
    { season: "2026", week: "5", season_type: "REG", player_display_name: "Terry McLaurin", team: "BUF" },
    { season: "2026", week: "6", season_type: "REG", player_display_name: "Terry McLaurin", team: "WSH" },
    { season: "2026", week: "7", season_type: "REG", player_display_name: "Terry McLaurin", team: "DAL" }, // the game's own week
    { season: "2025", week: "17", season_type: "REG", player_display_name: "Terry McLaurin", team: "LA" },
  ];
  assert.equal(currentTeam(box, "Terry McLaurin", 2026, 7), "WAS");
  assert.equal(currentTeam(box, "Terry McLaurin", 2026, 1), "LAR", "previous season, legacy code mapped");
  assert.equal(currentTeam(box, "Nobody", 2026, 7), null);
});
