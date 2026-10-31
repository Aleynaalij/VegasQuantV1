import type {
  NhlRecentGame,
  NhlSkater,
  NhlSource,
  NhlTeamReport,
} from "../../../src/lib/nhl-context.ts";
export const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;
export const seconds = (s: unknown) =>
  typeof s === "string" && /^\d{1,3}:[0-5]\d$/.test(s)
    ? Number(s.split(":")[0]) * 60 + Number(s.split(":")[1])
    : null;
const text = (n: any) =>
  typeof n === "string" ? n : typeof n?.default === "string" ? n.default : "";
const name = (p: any) =>
  [text(p.firstName), text(p.lastName)].filter(Boolean).join(" ");
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
export function rosterPlayers(d: any) {
  return [
    ...(Array.isArray(d?.forwards) ? d.forwards : []),
    ...(Array.isArray(d?.defensemen) ? d.defensemen : []),
    ...(Array.isArray(d?.goalies) ? d.goalies : []),
  ]
    .filter((p) => integer(p.id) && name(p))
    .map((p) => ({ id: p.id, name: name(p), goalie: p.positionCode === "G" }));
}
export function targetGame(
  schedule: any,
  away: string,
  home: string,
  start: string,
  season: number,
) {
  const matches = (Array.isArray(schedule?.games) ? schedule.games : []).filter(
    (g: any) =>
      g.season === season &&
      g.gameType === 2 &&
      g.awayTeam?.abbrev === away &&
      g.homeTeam?.abbrev === home &&
      Math.abs(Date.parse(g.startTimeUTC) - Date.parse(start)) <= 15 * 60000 &&
      g.gameScheduleState === "OK",
  );
  if (matches.length !== 1 || !integer(matches[0].id))
    throw Error(
      "Official NHL matchup identity/time is unavailable or ambiguous",
    );
  return matches[0];
}
export function recentGames(
  schedule: any,
  team: string,
  cutoff: string,
  season: number,
): any[] {
  const rows = (Array.isArray(schedule?.games) ? schedule.games : []).filter(
    (g: any) =>
      g.season === season &&
      g.gameType === 2 &&
      ["FINAL", "OFF"].includes(g.gameState) &&
      g.gameScheduleState === "OK" &&
      Date.parse(g.startTimeUTC) < Date.parse(cutoff) &&
      [g.awayTeam?.abbrev, g.homeTeam?.abbrev].includes(team),
  );
  const ids = new Set();
  for (const g of rows) {
    if (!integer(g.id) || ids.has(g.id))
      throw Error("Duplicate or missing NHL game identity");
    ids.add(g.id);
  }
  return rows
    .sort(
      (a: any, b: any) =>
        Date.parse(b.startTimeUTC) - Date.parse(a.startTimeUTC) || b.id - a.id,
    )
    .slice(0, 5);
}
export function gameLine(g: any, team: string): NhlRecentGame {
  const own =
    g.homeTeam?.abbrev === team
      ? g.homeTeam
      : g.awayTeam?.abbrev === team
        ? g.awayTeam
        : null;
  const opp = own === g.homeTeam ? g.awayTeam : g.homeTeam;
  if (
    !own ||
    !integer(own.score) ||
    !integer(opp?.score) ||
    own.score === opp.score
  )
    throw Error("Final NHL team score missing or tied");
  const won = own.score > opp.score,
    period = g.gameOutcome?.lastPeriodType;
  if (!["REG", "OT", "SO"].includes(period))
    throw Error("Final period/OT outcome unavailable");
  return {
    id: g.id,
    date: g.gameDate,
    opponent: opp.abbrev,
    result: won ? "W" : period === "REG" ? "L" : "OTL",
    goalsFor: own.score - (period === "SO" && won ? 1 : 0),
    goalsAgainst: opp.score - (period === "SO" && !won ? 1 : 0),
    url: `https://www.nhl.com${g.gameCenterLink || `/gamecenter/${g.id}`}`,
  };
}
export function teamForm(games: any[], team: string) {
  const lines = games.map((g) => gameLine(g, team));
  return {
    games: lines,
    record: lines.length
      ? {
          wins: lines.filter((g) => g.result === "W").length,
          losses: lines.filter((g) => g.result === "L").length,
          overtimeLosses: lines.filter((g) => g.result === "OTL").length,
        }
      : null,
    goalsForPerGame: lines.length
      ? lines.reduce((n, g) => n + g.goalsFor, 0) / lines.length
      : null,
    goalsAgainstPerGame: lines.length
      ? lines.reduce((n, g) => n + g.goalsAgainst, 0) / lines.length
      : null,
  };
}
export function skaterForm(
  games: any[],
  boxes: Map<number, any>,
  team: string,
  roster: { id: number; name: string }[],
  season: number,
): { skaters: NhlSkater[] | null; boxesVerified: number } {
  const totals = new Map<number, NhlSkater>();
  let verified = 0;
  for (const g of games) {
    const b = boxes.get(g.id);
    if (
      !b ||
      b.id !== g.id ||
      b.season !== season ||
      b.gameType !== 2 ||
      !["FINAL", "OFF"].includes(b.gameState) ||
      b.homeTeam?.abbrev !== g.homeTeam.abbrev ||
      b.awayTeam?.abbrev !== g.awayTeam.abbrev
    )
      continue;
    if (
      b.homeTeam.score !== g.homeTeam.score ||
      b.awayTeam.score !== g.awayTeam.score
    )
      continue;
    const side = b.homeTeam.abbrev === team ? "homeTeam" : "awayTeam",
      stats = b.playerByGameStats?.[side];
    if (!Array.isArray(stats?.forwards) || !Array.isArray(stats?.defense))
      continue;
    const rows = [...stats.forwards, ...stats.defense],
      ids = new Set();
    if (
      !rows.length ||
      rows.some(
        (p) =>
          !integer(p.playerId) ||
          ids.has(p.playerId) ||
          !ids.add(p.playerId) ||
          !integer(p.goals) ||
          !integer(p.assists) ||
          !integer(p.points) ||
          p.points !== p.goals + p.assists,
      )
    )
      continue;
    if (rows.reduce((n, p) => n + p.goals, 0) !== gameLine(g, team).goalsFor)
      continue;
    verified++;
    for (const p of rows) {
      const r = roster.find((r) => r.id === p.playerId),
        n = r?.name || text(p.name);
      if (!n) continue;
      const t = totals.get(p.playerId) || {
        id: p.playerId,
        name: n,
        goals: 0,
        points: 0,
        appearances: 0,
      };
      t.goals += p.goals;
      t.points += p.points;
      t.appearances++;
      totals.set(t.id, t);
    }
  }
  return {
    boxesVerified: verified,
    skaters:
      games.length && verified === games.length
        ? [...totals.values()].sort(
            (a, b) => b.points - a.points || b.goals - a.goals || a.id - b.id,
          )
        : null,
  };
}
export function goalieForm(d: any, cutoff: string) {
  const rows = (Array.isArray(d?.gameLog) ? d.gameLog : [])
    .filter(
      (g: any) =>
        typeof g.gameDate === "string" &&
        g.gameDate < cutoff.slice(0, 10) &&
        seconds(g.toi) !== 0,
    )
    .sort(
      (a: any, b: any) =>
        b.gameDate.localeCompare(a.gameDate) ||
        (b.gameId || 0) - (a.gameId || 0),
    )
    .slice(0, 5);
  if (!rows.length)
    return { sample: 0, gaa: null, seconds: null, goalsAgainst: null };
  const ids = new Set();
  if (
    rows.some(
      (g: any) =>
        !integer(g.gameId) ||
        ids.has(g.gameId) ||
        !ids.add(g.gameId) ||
        !integer(g.goalsAgainst) ||
        !seconds(g.toi),
    )
  )
    return {
      sample: rows.length,
      gaa: null,
      seconds: null,
      goalsAgainst: null,
    };
  const played = rows.reduce((n: number, g: any) => n + seconds(g.toi)!, 0),
    against = rows.reduce((n: number, g: any) => n + g.goalsAgainst, 0);
  return {
    sample: rows.length,
    gaa: (3600 * against) / played,
    seconds: played,
    goalsAgainst: against,
  };
}
const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
/** Public facts only. Date, exact away/home pair and lineup sections must all bind. */
export function rotowireLineup(
  html: string,
  day: string,
  away: string,
  home: string,
  source: NhlSource,
) {
  const heading = /Starting NHL lineups for ([A-Za-z]+ \d{1,2}, \d{4})/.exec(
    html,
  );
  if (
    !heading ||
    new Date(heading[1] + " 12:00:00 GMT").toISOString().slice(0, 10) !== day
  )
    return null;
  const chunks = html.split(/<div\s+class="lineup is-nhl[^\"]*"/).slice(1);
  const games = chunks.filter((c) => {
    const abbr = [...c.matchAll(/class="lineup__abbr"[^>]*>([^<]+)</g)].map(
      (m) => plain(m[1]),
    );
    return abbr[0] === away && abbr[1] === home;
  });
  if (games.length !== 1) return null;
  return (["visit", "home"] as const).map((side) => {
    const list = new RegExp(
      `<ul[^>]*class="lineup__list is-${side}"[^>]*>([\\s\\S]*?)<\\/ul>`,
    ).exec(games[0])?.[1];
    if (!list) return null;
    const goalie =
      /<li[^>]*class="lineup__player-highlight"[^>]*>([\s\S]*?)<\/li>/.exec(
        list,
      )?.[1] || "";
    const goalieAnchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/.exec(goalie);
    const goalieName = plain(
      goalieAnchor?.[1].match(/title="([^"]+)"/)?.[1] ||
        goalieAnchor?.[2] ||
        "",
    );
    const status: "confirmed" | "expected" | "unknown" =
      /class="[^"]*\bis-confirmed\b/.test(goalie)
        ? "confirmed"
        : /Expected|Unconfirmed|is-unconfirmed/i.test(goalie)
          ? "expected"
          : "unknown";
    const pp =
      /POWER PLAY #1<\/li>([\s\S]*?)(?:<li[^>]*class="lineup__title\b[^"]*"|$)/.exec(
        list,
      )?.[1] || "";
    const players = [
      ...pp.matchAll(/<li[^>]*class="lineup__player"[^>]*>([\s\S]*?)<\/li>/g),
    ]
      .map((m) => {
        const a = /<a\b([^>]*)>([\s\S]*?)<\/a>/.exec(m[1]);
        return {
          name: plain(a?.[1].match(/title="([^"]+)"/)?.[1] || a?.[2] || ""),
          position: plain(
            /class="lineup__pos"[^>]*>([^<]*)/.exec(m[1])?.[1] || "",
          ),
        };
      })
      .filter((p) => p.name && p.position);
    return {
      goalie: goalieName ? { name: goalieName, status, source } : null,
      powerPlay:
        players.length === 5
          ? { players, status: "projected" as const, source }
          : null,
    };
  });
}
export function resolveGoalie(
  roster: ReturnType<typeof rosterPlayers>,
  name: string,
) {
  const matches = roster.filter((p) => p.goalie && norm(p.name) === norm(name));
  return matches.length === 1 ? matches[0] : null;
}
