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
export function positionCardPayload(input: unknown): DvpCard | null {
  const p = input as {
    body?: string;
    game?: { away_team: string; home_team: string; kickoff: string };
  };
  if (!p || typeof p.body !== "string" || !p.game) return null;
  const { away_team: away, home_team: home, kickoff } = p.game;
  const a = NFL_ABBR[away],
    h = NFL_ABBR[home];
  const week = /\d{4} REG through Week (\d+)/.exec(p.body);
  if (!a || !h || !week || !Number.isFinite(Date.parse(kickoff))) return null;
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
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(kickoff));
  return {
    day,
    page: 1,
    pages: 1,
    throughWeek: Number(week[1]),
    games: [{ away, home, kickoff, awayAbbr: a, homeAbbr: h, lines }],
  };
}
