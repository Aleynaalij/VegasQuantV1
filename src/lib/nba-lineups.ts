/** Public RotoWire facts only. Never infer starters from depth charts, injuries or player names. */
export const NBA_LINEUP_SOURCE =
  "https://www.rotowire.com/basketball/nba-lineups.php";
export const NBA_LINEUP_MAX_AGE_MS = 180_000;
export type LineupPlayer = {
  id: string;
  name: string;
  position: string;
  status: string | null;
};
export type TeamLineup = {
  team: string;
  status: "confirmed" | "expected" | "unavailable";
  starters: LineupPlayer[];
  availability: LineupPlayer[];
};
export type GameLineup = {
  day: string;
  time: string;
  away: TeamLineup;
  home: TeamLineup;
};
export type LineupReport = {
  version: 1;
  source: typeof NBA_LINEUP_SOURCE;
  checked_at: string;
  games: GameLineup[];
};
type Node = {
  tag: string;
  attrs: Record<string, string>;
  children: (Node | string)[];
};
const decode = (s: string) =>
  s.replace(/&(?:#(x[0-9a-f]+|\d+)|([a-z]+));/gi, (all, n, k) => {
    if (n) {
      const code =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return (
      (
        {
          amp: "&",
          quot: '"',
          apos: "'",
          nbsp: " ",
          lt: "<",
          gt: ">",
        } as Record<string, string>
      )[k] ?? all
    );
  });
const text = (n: Node): string =>
  n.children
    .map((c) => (typeof c === "string" ? decode(c) : text(c)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
const has = (n: Node, c: string) =>
  (n.attrs.class || "").split(/\s+/).includes(c);
const nodes = (n: Node, test: (c: Node) => boolean): Node[] =>
  n.children.flatMap((c) =>
    typeof c === "string" ? [] : [...(test(c) ? [c] : []), ...nodes(c, test)],
  );
const one = (n: Node, c: string) => {
  const all = nodes(n, (x) => has(x, c));
  return all.length === 1 ? all[0] : null;
};
/** Bounded non-executing tokenizer. Only a provider's public main element is read; scripts/styles
 * are stripped, no URLs are fetched and no provider HTML is ever rendered in the app. */
function tree(html: string): Node {
  if (html.length > 1_000_000) throw Error("Lineup source too large");
  const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main\s*>/i)?.[0];
  if (!main) throw Error("Lineup source markup unavailable");
  const clean = main.replace(
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  const root: Node = { tag: "root", attrs: {}, children: [] },
    stack = [root];
  let count = 0;
  for (const m of clean.matchAll(
    /<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*?>|[^<]+/g,
  )) {
    if (++count > 60000 || stack.length > 100)
      throw Error("Invalid lineup source");
    const token = m[0];
    if (!token.startsWith("<")) {
      stack.at(-1)!.children.push(token);
      continue;
    }
    const tag = token.match(/^<\/?([a-z0-9-]+)/i)?.[1].toLowerCase();
    if (!tag) continue;
    if (token.startsWith("</")) {
      const i = stack.findLastIndex((n) => n.tag === tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of token
      .slice(tag.length + 1)
      .matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4]);
    const n: Node = { tag, attrs, children: [] };
    stack.at(-1)!.children.push(n);
    if (
      !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(
        tag,
      ) &&
      !token.endsWith("/>")
    )
      stack.push(n);
  }
  return root;
}
const TEAM_ALIASES: Record<string, string> = {
  GS: "GSW",
  NY: "NYK",
  NO: "NOP",
  SA: "SAS",
  PHO: "PHX",
  BRK: "BKN",
  UTAH: "UTA",
  WSH: "WAS",
};
const TEAMS = new Set(
  "ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS".split(
    " ",
  ),
);
export const lineupTeam = (value: string | null | undefined): string | null => {
  const raw = value?.trim().toUpperCase() || "";
  const v = TEAM_ALIASES[raw] || raw;
  return TEAMS.has(v) ? v : null;
};
const labels: Record<string, string> = {
  out: "Out",
  ofs: "Out for season",
  inactive: "Inactive",
  suspended: "Suspended",
  doubt: "Doubtful",
  doubtful: "Doubtful",
  ques: "Questionable",
  questionable: "Questionable",
  gtd: "Game-time decision",
  prob: "Probable",
  probable: "Probable",
};
const out = (p: LineupPlayer) =>
  ["Out", "Out for season", "Inactive", "Suspended"].includes(p.status || "");
function side(block: Node, which: "is-visit" | "is-home"): TeamLineup | null {
  const teamNode = nodes(block, (n) => has(n, "lineup__team") && has(n, which));
  const lists = nodes(block, (n) => has(n, "lineup__list") && has(n, which));
  if (teamNode.length !== 1 || lists.length !== 1) return null;
  const abbr = one(teamNode[0], "lineup__abbr"),
    team = abbr ? lineupTeam(text(abbr)) : null;
  if (!team) return null;
  const list = lists[0];
  let injurySection = false;
  const starters: LineupPlayer[] = [],
    availability: LineupPlayer[] = [];
  let malformed = false;
  for (const item of list.children.filter(
    (c): c is Node => typeof c !== "string",
  )) {
    if (has(item, "lineup__title")) {
      injurySection = true;
      continue;
    }
    if (!has(item, "lineup__player")) continue;
    const links = nodes(
      item,
      (n) =>
        n.tag === "a" &&
        /^\/basketball\/player\/[a-z0-9-]+-\d+$/.test(n.attrs.href || ""),
    );
    const link = links.length === 1 ? links[0] : null,
      position = one(item, "lineup__pos"),
      injury = one(item, "lineup__inj");
    const id = link?.attrs.href.match(/-(\d+)$/)?.[1],
      name = link?.attrs.title?.trim();
    if (!id || !name || name.length > 100 || !position) {
      malformed = true;
      continue;
    }
    const status = injury
      ? labels[text(injury).toLowerCase()] || "Status unclear"
      : null;
    const p = { id, name, position: text(position).slice(0, 4), status };
    if (injurySection) {
      if (status) availability.push(p);
      else malformed = true;
    } else {
      starters.push(p);
      if (status) availability.push(p);
    }
  }
  const statuses = nodes(list, (n) => has(n, "lineup__status"));
  const status = statuses.length === 1 ? statuses[0] : null;
  const five =
    starters.length === 5 &&
    new Set(starters.map((p) => p.id)).size === 5 &&
    new Set(starters.map((p) => p.position)).size === 5 &&
    starters.every((p) => /^(PG|SG|SF|PF|C)$/.test(p.position));
  const isConfirmed =
    status &&
    has(status, "is-confirmed") &&
    /^Confirmed Lineup$/i.test(text(status));
  const isExpected =
    status &&
    has(status, "is-expected") &&
    /^Expected Lineup$/i.test(text(status));
  // Never let a later uncertain row erase an explicit Out for the same provider player ID.
  // Conflicts make the team's lineup incomplete even when the disputed player is a nonstarter.
  const byPlayer = new Map<string, LineupPlayer>();
  for (const p of availability) {
    const previous = byPlayer.get(p.id);
    if (
      previous &&
      (previous.name !== p.name || previous.status !== p.status)
    ) {
      malformed = true;
      byPlayer.set(
        p.id,
        out(previous)
          ? previous
          : out(p)
            ? p
            : { ...previous, status: "Conflicting report" },
      );
    } else byPlayer.set(p.id, p);
  }
  const contradictory = starters.some((p) =>
    availability.some((a) => a.id === p.id && out(a)),
  );
  return {
    team,
    status:
      !malformed && five && !contradictory
        ? isConfirmed
          ? "confirmed"
          : isExpected
            ? "expected"
            : "unavailable"
        : "unavailable",
    starters: five && !malformed && !contradictory ? starters : [],
    availability: [...byPlayer.values()],
  };
}
export function easternLineupDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function parseNbaLineups(html: string, now: number): LineupReport {
  if (!Number.isFinite(now)) throw Error("Invalid lineup clock");
  const root = tree(html),
    mains = nodes(root, (n) => n.tag === "main");
  const day = mains.length === 1 ? mains[0].attrs["data-gamedate"] : null;
  if (!day || day !== easternLineupDay(now))
    throw Error("Lineup source is for another date");
  const blocks = nodes(root, (n) => has(n, "lineup") && has(n, "is-nba"));
  if (!blocks.length || blocks.length > 30)
    throw Error("Lineup source unavailable");
  const games: GameLineup[] = [];
  for (const block of blocks) {
    const away = side(block, "is-visit"),
      home = side(block, "is-home"),
      timeNode = one(block, "lineup__time");
    const time = timeNode
      ? text(timeNode).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s+ET$/i)
      : null;
    if (
      !away ||
      !home ||
      away.team === home.team ||
      !time ||
      Number(time[1]) < 1 ||
      Number(time[1]) > 12 ||
      Number(time[2]) > 59
    )
      continue;
    const hour =
      (Number(time[1]) % 12) + (time[3].toUpperCase() === "PM" ? 12 : 0);
    if (away.starters.some((p) => home.starters.some((q) => q.id === p.id))) {
      away.status = "unavailable";
      home.status = "unavailable";
      away.starters = [];
      home.starters = [];
    }
    games.push({
      day,
      time: `${String(hour).padStart(2, "0")}:${time[2]}`,
      away,
      home,
    });
  }
  if (!games.length) throw Error("No identifiable lineup games");
  // Duplicate source identities are ambiguous: do not arbitrarily pick one, even if identical.
  const key = (g: GameLineup) =>
    `${g.day}|${g.time}|${g.away.team}|${g.home.team}`;
  return {
    version: 1,
    source: NBA_LINEUP_SOURCE,
    checked_at: new Date(now).toISOString(),
    games: games.filter(
      (g) => games.filter((x) => key(x) === key(g)).length === 1,
    ),
  };
}
export type LineupGameIdentity = {
  away: string | null;
  home: string | null;
  start: string;
  tbd?: boolean;
};
export function lineupForGame(
  report: LineupReport | null,
  game: LineupGameIdentity,
  now: number,
): GameLineup | null {
  const at = Date.parse(report?.checked_at || ""),
    start = Date.parse(game.start);
  if (
    !report ||
    report.version !== 1 ||
    report.source !== NBA_LINEUP_SOURCE ||
    !Number.isFinite(now) ||
    !Number.isFinite(at) ||
    at > now ||
    now - at >= NBA_LINEUP_MAX_AGE_MS ||
    !Number.isFinite(start) ||
    game.tbd
  )
    return null;
  const away = lineupTeam(game.away),
    home = lineupTeam(game.home);
  if (!away || !home) return null;
  const day = easternLineupDay(start),
    time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(start);
  if (day !== easternLineupDay(now)) return null;
  const matches = report.games.filter(
    (g) =>
      g.day === day &&
      g.time === time &&
      g.away.team === away &&
      g.home.team === home,
  );
  return matches.length === 1 ? matches[0] : null;
}
export function lineupOuts(g: GameLineup): string[] {
  return [g.away, g.home].flatMap((t) =>
    t.availability.filter(out).map((p) => `${p.name} (${t.team})`),
  );
}
