/**
 * Sunday NFL research cards (owner request, Nov 8 2026), built from nflverse weekly player stats.
 *
 *  - WR matchups: notable receivers on Sunday/Monday teams, rated 0-100 against the opposing pass
 *    defense's season output allowed to wide receivers. We have no cornerback-assignment data, so the
 *    rating is receiver vs defense, never a named defender.
 *  - Defense vs position: for every Sunday/Monday game, where each defense ranks in the top 8 for
 *    production allowed (per game) or for sacks/interceptions.
 *
 * Research only: season averages, not projections or picks.
 */

export type StatRow = Record<string, string>;
export type CardGame = { away: string; home: string; kickoff: string };

/** Full team name (games table) → nflverse abbreviation. */
export const NFL_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Los Angeles Rams": "LA",
  "Los Angeles Chargers": "LAC",
  "Las Vegas Raiders": "LV",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "Seattle Seahawks": "SEA",
  "San Francisco 49ers": "SF",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};
const NICK: Record<string, string> = Object.fromEntries(
  Object.entries(NFL_ABBR).map(([name, abbr]) => [
    abbr,
    name.split(" ").pop()!.toUpperCase(),
  ]),
);
export const nickname = (abbr: string) => NICK[abbr] || abbr;

/** RFC 4180 CSV (quoted fields may hold commas, quotes and newlines) → rows keyed by header. */
export function parseCsv(text: string): StatRow[] {
  const out: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      (row.push(field), out.push(row), (row = []), (field = ""));
    } else field += c;
  }
  if (field || row.length) (row.push(field), out.push(row));
  const [head, ...rest] = out;
  return (head ? rest : [])
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""])));
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type Metric = {
  key: string;
  group: string | null; // offensive position group credited; null = kicker (field goals)
  field: string;
  label: string;
};
/** "allowed" metrics, phrased as the example card: "<TEAM> ALLOW 3RD MOST <label>". */
export const ALLOWED: Metric[] = [
  {
    key: "qb_pass_yds",
    group: "QB",
    field: "passing_yards",
    label: "PASS YARDS TO QB",
  },
  {
    key: "qb_pass_tds",
    group: "QB",
    field: "passing_tds",
    label: "PASS TDS TO QB",
  },
  {
    key: "qb_att",
    group: "QB",
    field: "attempts",
    label: "PASS ATTEMPTS TO QB",
  },
  {
    key: "qb_cmp",
    group: "QB",
    field: "completions",
    label: "COMPLETIONS TO QB",
  },
  {
    key: "qb_rush_yds",
    group: "QB",
    field: "rushing_yards",
    label: "RUSH YARDS TO QB",
  },
  {
    key: "qb_rush_tds",
    group: "QB",
    field: "rushing_tds",
    label: "RUSH TDS TO QB",
  },
  {
    key: "rb_rush_yds",
    group: "RB",
    field: "rushing_yards",
    label: "RUSH YARDS TO RB",
  },
  {
    key: "rb_rush_tds",
    group: "RB",
    field: "rushing_tds",
    label: "RUSH TDS TO RB",
  },
  {
    key: "rb_rec_yds",
    group: "RB",
    field: "receiving_yards",
    label: "RECEIVING YARDS TO RB",
  },
  {
    key: "rb_rec",
    group: "RB",
    field: "receptions",
    label: "RECEPTIONS TO RB",
  },
  {
    key: "wr_rec_yds",
    group: "WR",
    field: "receiving_yards",
    label: "RECEIVING YARDS TO WR",
  },
  {
    key: "wr_rec_tds",
    group: "WR",
    field: "receiving_tds",
    label: "RECEIVING TDS TO WR",
  },
  {
    key: "wr_rec",
    group: "WR",
    field: "receptions",
    label: "RECEPTIONS TO WR",
  },
  {
    key: "wr_tgt",
    group: "WR",
    field: "targets",
    label: "RECEIVING TARGETS TO WR",
  },
  {
    key: "te_rec",
    group: "TE",
    field: "receptions",
    label: "RECEPTIONS TO TE",
  },
  {
    key: "te_tgt",
    group: "TE",
    field: "targets",
    label: "RECEIVING TARGETS TO TE",
  },
  {
    key: "te_rec_yds",
    group: "TE",
    field: "receiving_yards",
    label: "RECEIVING YARDS TO TE",
  },
  {
    key: "te_rec_tds",
    group: "TE",
    field: "receiving_tds",
    label: "RECEIVING TDS TO TE",
  },
  { key: "fg", group: null, field: "fg_made", label: "FIELD GOALS" },
];
/** The defense's own production: "<TEAM> RANK #6 IN SACKS". */
export const MADE: Metric[] = [
  { key: "sacks", group: "", field: "def_sacks", label: "SACKS" },
  {
    key: "ints",
    group: "",
    field: "def_interceptions",
    label: "INTERCEPTIONS",
  },
];

export type TeamTable = {
  teams: string[];
  games: Record<string, number>;
  /** per-game value by metric key and team */
  value: Record<string, Record<string, number>>;
  /** 1 = most; ties share the best rank */
  rank: Record<string, Record<string, number>>;
};

function rankDesc(values: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [t, v] of Object.entries(values))
    out[t] = 1 + Object.values(values).filter((x) => x > v + 1e-9).length;
  return out;
}

/** Per-game production allowed by (and made by) each defense, season to date (REG only). */
export function teamTable(rows: StatRow[]): TeamTable {
  const reg = rows.filter((r) => (r.season_type || "REG") === "REG");
  const defGames: Record<string, Set<string>> = {};
  const ownGames: Record<string, Set<string>> = {};
  for (const r of reg) {
    if (r.opponent_team)
      (defGames[r.opponent_team] ||= new Set()).add(r.game_id);
    if (r.team) (ownGames[r.team] ||= new Set()).add(r.game_id);
  }
  const teams = Object.keys(defGames).sort();
  const value: TeamTable["value"] = {};
  for (const m of ALLOWED) {
    const sum: Record<string, number> = Object.fromEntries(
      teams.map((t) => [t, 0]),
    );
    for (const r of reg) {
      if (!(r.opponent_team in sum)) continue;
      const credited =
        m.group === null
          ? num(r.fg_att) > 0 || num(r.fg_made) > 0
          : r.position_group === m.group;
      if (credited) sum[r.opponent_team] += num(r[m.field]);
    }
    value[m.key] = Object.fromEntries(
      teams.map((t) => [t, sum[t] / Math.max(1, defGames[t].size)]),
    );
  }
  for (const m of MADE) {
    const sum: Record<string, number> = Object.fromEntries(
      teams.map((t) => [t, 0]),
    );
    for (const r of reg) if (r.team in sum) sum[r.team] += num(r[m.field]);
    value[m.key] = Object.fromEntries(
      teams.map((t) => [t, sum[t] / Math.max(1, ownGames[t]?.size || 1)]),
    );
  }
  const rank: TeamTable["rank"] = {};
  for (const k of Object.keys(value)) rank[k] = rankDesc(value[k]);
  return {
    teams,
    games: Object.fromEntries(teams.map((t) => [t, defGames[t].size])),
    value,
    rank,
  };
}

export const ordinal = (n: number) =>
  n === 1
    ? "MOST"
    : `${n}${n % 10 === 2 && n % 100 !== 12 ? "ND" : n % 10 === 3 && n % 100 !== 13 ? "RD" : n % 10 === 1 && n % 100 !== 11 ? "ST" : "TH"} MOST`;

export type DvpLine = {
  team: string;
  rank: number;
  kind: "allow" | "made";
  text: string;
};
export type DvpGame = CardGame & {
  awayAbbr: string;
  homeAbbr: string;
  lines: DvpLine[];
};
export type DvpCard = {
  day: string;
  page: number;
  pages: number;
  throughWeek: number;
  games: DvpGame[];
};

const TOP = 8;
const LINES_PER_GAME = 10;

/** Each defense's top-8 ranks, best first, at most LINES_PER_GAME per game (teams interleaved). */
export function dvpLines(
  table: TeamTable,
  awayAbbr: string,
  homeAbbr: string,
): DvpLine[] {
  const forTeam = (t: string) => {
    const out: DvpLine[] = [];
    for (const m of MADE) {
      const r = table.rank[m.key]?.[t];
      // A tie at zero is not a ranking ("allow most" of nothing): only positive values are listed.
      if (r && r <= TOP && table.value[m.key][t] > 0)
        out.push({
          team: t,
          rank: r,
          kind: "made",
          text: `${nickname(t)} RANK #${r} IN ${m.label}`,
        });
    }
    for (const m of ALLOWED) {
      const r = table.rank[m.key]?.[t];
      if (r && r <= TOP && table.value[m.key][t] > 0)
        out.push({
          team: t,
          rank: r,
          kind: "allow",
          text: `${nickname(t)} ALLOW ${ordinal(r)} ${m.label}`,
        });
    }
    return out.sort(
      (a, b) =>
        a.rank - b.rank || (a.kind === b.kind ? 0 : a.kind === "made" ? -1 : 1),
    );
  };
  const a = forTeam(awayAbbr),
    h = forTeam(homeAbbr);
  const take = Math.min(LINES_PER_GAME, a.length + h.length);
  // Fair share per team, the other team fills any unused room; then each team's lines stay grouped.
  let na = Math.min(a.length, Math.ceil(take / 2)),
    nh = Math.min(h.length, take - na);
  na = Math.min(a.length, take - nh);
  return [...a.slice(0, na), ...h.slice(0, nh)];
}

export type WrRow = {
  player: string;
  team: string;
  opponent: string;
  kickoff: string;
  targetsPerGame: number;
  score: number;
  /** opponent's rank in WR receiving yards allowed per game (1 = most) */
  yardsRank: number;
};
export type WrCard = {
  day: string;
  page: number;
  pages: number;
  throughWeek: number;
  rows: WrRow[];
};

/** 0-100: share of defenses that allow less to WRs (yards 50%, TDs 30%, receptions 20%, z-scored). */
export function wrDefenseScores(table: TeamTable) {
  const z = (k: string) => {
    const v = table.teams.map((t) => table.value[k][t]);
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    const sd =
      Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length) || 1;
    return (t: string) => (table.value[k][t] - mean) / sd;
  };
  const zy = z("wr_rec_yds"),
    zt = z("wr_rec_tds"),
    zr = z("wr_rec");
  const comp: Record<string, number> = Object.fromEntries(
    table.teams.map((t) => [t, 0.5 * zy(t) + 0.3 * zt(t) + 0.2 * zr(t)]),
  );
  const n = table.teams.length;
  return Object.fromEntries(
    table.teams.map((t) => {
      const below = table.teams.filter((u) => comp[u] < comp[t] - 1e-12).length;
      const ties =
        table.teams.filter((u) => Math.abs(comp[u] - comp[t]) <= 1e-12).length -
        1;
      return [t, Math.round((100 * (below + ties / 2)) / Math.max(1, n - 1))];
    }),
  ) as Record<string, number>;
}

export const tier = (score: number) =>
  score >= 60 ? "green" : score >= 40 ? "yellow" : "red";

const WR_PER_CARD = 14;
const MIN_GAMES = 3;

/**
 * Notable receivers: WRs with 3+ games who played in their team's latest game, top 2 per team by
 * targets per game, then the 28 busiest overall. Sorted best matchup first and split over two cards.
 */
export function wrRows(
  rows: StatRow[],
  games: CardGame[],
  table: TeamTable,
): WrRow[] {
  const scores = wrDefenseScores(table);
  const reg = rows.filter((r) => (r.season_type || "REG") === "REG");
  const lastWeek: Record<string, number> = {};
  for (const r of reg)
    lastWeek[r.team] = Math.max(lastWeek[r.team] || 0, num(r.week));
  const opp: Record<string, { opponent: string; kickoff: string }> = {};
  for (const g of games) {
    const a = NFL_ABBR[g.away],
      h = NFL_ABBR[g.home];
    if (a && h) {
      opp[a] = { opponent: h, kickoff: g.kickoff };
      opp[h] = { opponent: a, kickoff: g.kickoff };
    }
  }
  const players = new Map<
    string,
    {
      player: string;
      team: string;
      games: number;
      targets: number;
      latest: boolean;
    }
  >();
  for (const r of reg) {
    if (r.position !== "WR" || !opp[r.team]) continue;
    const key = `${r.player_id}|${r.team}`;
    const p = players.get(key) || {
      player: r.player_display_name || r.player_name,
      team: r.team,
      games: 0,
      targets: 0,
      latest: false,
    };
    p.games += 1;
    p.targets += num(r.targets);
    if (num(r.week) === lastWeek[r.team]) p.latest = true;
    players.set(key, p);
  }
  const byTeam: Record<string, WrRow[]> = {};
  for (const p of players.values()) {
    if (p.games < MIN_GAMES || !p.latest || !(opp[p.team].opponent in scores))
      continue;
    (byTeam[p.team] ||= []).push({
      player: p.player,
      team: p.team,
      opponent: opp[p.team].opponent,
      kickoff: opp[p.team].kickoff,
      targetsPerGame: p.targets / p.games,
      score: scores[opp[p.team].opponent],
      yardsRank: table.rank.wr_rec_yds[opp[p.team].opponent],
    });
  }
  return Object.values(byTeam)
    .flatMap((list) =>
      list.sort((a, b) => b.targetsPerGame - a.targetsPerGame).slice(0, 2),
    )
    .sort((a, b) => b.targetsPerGame - a.targetsPerGame)
    .slice(0, WR_PER_CARD * 2)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.targetsPerGame - a.targetsPerGame ||
        a.player.localeCompare(b.player),
    );
}

export type WeeklyCards = { wr: WrCard[]; dvp: DvpCard[] };

/** Every card for one Sunday: two WR cards and one defense card per four Sunday/Monday games. */
export function buildWeeklyCards(
  day: string,
  rows: StatRow[],
  games: CardGame[],
): WeeklyCards {
  const table = teamTable(rows);
  const throughWeek = Math.max(0, ...rows.map((r) => num(r.week)));
  const wr = wrRows(rows, games, table);
  const wrCards: WrCard[] = [];
  for (let i = 0; i < wr.length; i += WR_PER_CARD)
    wrCards.push({
      day,
      page: wrCards.length + 1,
      pages: 0,
      throughWeek,
      rows: wr.slice(i, i + WR_PER_CARD),
    });
  wrCards.forEach((c) => (c.pages = wrCards.length));
  const dvpGames: DvpGame[] = [...games]
    .sort(
      (a, b) =>
        Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
        a.away.localeCompare(b.away),
    )
    .filter((g) => NFL_ABBR[g.away] && NFL_ABBR[g.home])
    .map((g) => {
      const awayAbbr = NFL_ABBR[g.away],
        homeAbbr = NFL_ABBR[g.home];
      return {
        ...g,
        awayAbbr,
        homeAbbr,
        lines: dvpLines(table, awayAbbr, homeAbbr),
      };
    });
  const dvp: DvpCard[] = [];
  for (let i = 0; i < dvpGames.length; i += 4)
    dvp.push({
      day,
      page: dvp.length + 1,
      pages: 0,
      throughWeek,
      games: dvpGames.slice(i, i + 4),
    });
  dvp.forEach((c) => (c.pages = dvp.length));
  return { wr: wrCards, dvp };
}

/** "nfl-wr:2026-11-08:1" / "nfl-dvp:2026-11-08:3" */
export function weeklyCardRef(card: string | null | undefined) {
  const m = /^nfl-(wr|dvp):(\d{4}-\d{2}-\d{2}):(\d{1,2})$/.exec(card || "");
  return m
    ? { kind: m[1] as "wr" | "dvp", day: m[2], page: Number(m[3]) }
    : null;
}

/** Kickoff in ET: "SUN 1:00 PM ET" */
export function kickoffLabel(at: string) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "TIME TBD";
  const day = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "America/New_York",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  return `${day} ${time} ET`.toUpperCase();
}

/** Plain-text version for the post body (and screen readers), within the Zone's 2,000 characters. */
export function wrCardText(c: WrCard) {
  const lines = c.rows.map(
    (r) =>
      `${r.score} · ${r.player} (${r.team}) vs ${r.opponent}: ${tier(r.score)}, opp. allows ${ordinal(r.yardsRank).toLowerCase()} WR yards/g`,
  );
  return [
    `WR matchups ${c.page} of ${c.pages}: notable receivers vs the opposing pass defense (0-100, higher = friendlier).`,
    ...lines,
    `Season data through week ${c.throughWeek}. Defense allowed to WRs per game (yards 50%, TDs 30%, catches 20%); not a cornerback assignment. Research only, not picks. Stats: nflverse.`,
  ]
    .join("\n")
    .slice(0, 2000);
}
export function dvpCardText(c: DvpCard) {
  const blocks = c.games.map(
    (g) =>
      `${g.away} @ ${g.home} · ${kickoffLabel(g.kickoff)}\n${g.lines.map((l) => l.text).join("\n") || "No top-8 defensive ranks either way."}`,
  );
  return [
    `Defense vs position ${c.page} of ${c.pages}: top-8 season ranks (per game) for Sunday and Monday games.`,
    ...blocks,
    `Season data through week ${c.throughWeek}. Research only, not picks. Stats: nflverse.`,
  ]
    .join("\n\n")
    .slice(0, 2000);
}
