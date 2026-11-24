import {
  ALLOWED,
  NFL_ABBR,
  nickname,
  ordinal,
  type DvpCard,
} from "./nfl-weekly-cards";

/** Off-cycle DvP reports use the same renderer as Sunday cards, never the generic excerpt. */
export function positionCardPostId(p: {
  id: string;
  sport: string;
  title: string;
  card?: string | null;
  legs: string[];
}): string | null {
  return p.sport === "nfl" &&
    p.card === "vq-publication:v1" &&
    !p.legs.length &&
    /^Defense vs Position · /i.test(p.title) &&
    /^[0-9a-f-]{36}$/i.test(p.id)
    ? p.id
    : null;
}
const AVERAGE_HEADER = "DEFENSE VS POSITION | ALLOWED PER GAME";
const AVERAGE_METRICS = [
  "WR targets",
  "WR catches",
  "WR yards",
  "RB rush yards",
  "RB receiving yards",
  "TE receiving yards",
  "QB pass yards",
] as const;

type PositionAverages = {
  season: string;
  sampleGames: number;
  checked: string;
  awayLabel: string;
  homeLabel: string;
  rows: Array<{
    label: (typeof AVERAGE_METRICS)[number];
    away: string;
    home: string;
  }>;
};

export type PositionCard = DvpCard & { averages?: PositionAverages };

/** Accept the explicit two-team summary only, not numbers from later commentary. */
function parseAverages(body: string, away: string, home: string) {
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const cutoff = lines.flatMap((line) => {
    const match =
      /^Checked ([A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M ET)\. (\d{4}) REG Weeks 1[–-]([1-9]\d?) for both clubs; ([1-9]\d?) games per defense\. Research only\.$/.exec(
        line,
      );
    return match ? [match] : [];
  });
  const heading = lines.indexOf(AVERAGE_HEADER);
  if (
    cutoff.length !== 1 ||
    heading === -1 ||
    heading !== lines.lastIndexOf(AVERAGE_HEADER) ||
    lines.indexOf(cutoff[0][0]) >= heading ||
    lines[heading + 3] !== ""
  )
    return null;

  const [, checked, season, endWeek, games] = cutoff[0];
  const throughWeek = Number(endWeek);
  const sampleGames = Number(games);
  if (throughWeek > 18 || sampleGames > throughWeek) return null;

  const parseTeam = (line: string | undefined) => {
    // Keep the published decimal strings, including significant trailing zeroes.
    const match =
      /^([A-Z]{2,3}): WR (\d{1,3}(?:\.\d{1,2})?) targets \/ (\d{1,3}(?:\.\d{1,2})?) catches \/ (\d{1,3}(?:\.\d{1,2})?) yards; RB (\d{1,3}(?:\.\d{1,2})?) rush yards \/ (\d{1,3}(?:\.\d{1,2})?) receiving yards; TE (\d{1,3}(?:\.\d{1,2})?) receiving yards; QB (\d{1,3}(?:\.\d{1,2})?) pass yards\.$/.exec(
        line ?? "",
      );
    return match ? { team: match[1], values: match.slice(2) } : null;
  };
  const first = parseTeam(lines[heading + 1]);
  const second = parseTeam(lines[heading + 2]);
  if (!first || !second) return null;
  // The published summary uses LAR; the weekly-card abbreviation table uses LA.
  const weeklyAbbr = (team: string) => (team === "LAR" ? "LA" : team);
  const a = [first, second].find((team) => weeklyAbbr(team.team) === away);
  const h = [first, second].find((team) => weeklyAbbr(team.team) === home);
  if (!a || !h || away === home) return null;

  return {
    throughWeek,
    averages: {
      checked,
      season,
      sampleGames,
      awayLabel: a.team,
      homeLabel: h.team,
      rows: AVERAGE_METRICS.map((label, i) => ({
        label,
        away: a.values[i],
        home: h.values[i],
      })),
    },
  };
}

export function positionCardPayload(input: unknown): PositionCard | null {
  const p = input as {
    body?: string;
    game?: { away_team: string; home_team: string; kickoff: string };
  };
  if (!p || typeof p.body !== "string" || !p.game) return null;
  const { away_team: away, home_team: home, kickoff } = p.game;
  const a = NFL_ABBR[away],
    h = NFL_ABBR[home];
  if (!a || !h || !Number.isFinite(Date.parse(kickoff))) return null;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(kickoff));
  const matchup = { away, home, kickoff, awayAbbr: a, homeAbbr: h };
  if (p.body.includes(AVERAGE_HEADER)) {
    const summary = parseAverages(p.body, a, h);
    if (!summary) return null;
    return {
      day,
      page: 1,
      pages: 1,
      ...summary,
      games: [{ ...matchup, lines: [] }],
    };
  }

  const week = /\d{4} REG through Week (\d+)/.exec(p.body);
  if (!week) return null;
  const lines: DvpCard["games"][number]["lines"] = [];
  let team = "";
  for (const row of p.body.split("\n")) {
    if (
      row === `${away.split(" ").slice(0, -1).join(" ").toUpperCase()} ALLOWS`
    )
      team = a;
    else if (
      row === `${home.split(" ").slice(0, -1).join(" ").toUpperCase()} ALLOWS`
    )
      team = h;
    else if (row.startsWith("#")) {
      const m = /^#([1-8]) ([A-Za-z ]+) — \d+(?:\.\d+)?\/game$/.exec(row);
      if (!m || ![a, h].includes(team)) return null;
      const label = m[2]
        .toUpperCase()
        .replace(/PASSING/g, "PASS")
        .replace(/RUSHING/g, "RUSH");
      if (!ALLOWED.some((metric) => metric.label === label)) return null;
      const rank = Number(m[1]);
      lines.push({
        team,
        rank,
        kind: "allow",
        text: `${nickname(team)} ALLOW ${ordinal(rank)} ${label}`,
      });
    }
  }
  if (
    !lines.length ||
    lines.length > 10 ||
    new Set(lines.map((l) => l.text)).size !== lines.length
  )
    return null;
  return {
    day,
    page: 1,
    pages: 1,
    throughWeek: Number(week[1]),
    games: [{ ...matchup, lines }],
  };
}
