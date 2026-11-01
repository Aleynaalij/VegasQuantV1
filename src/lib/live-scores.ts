/**
 * Live game day (owner, Oct 31 2026): scores for games in progress and today's finals, from ESPN's
 * public scoreboard, for every sport. Games leave the Home slate once they start; this keeps them on
 * screen with the score, period and clock, and links each to its matchup.
 */
export type LiveSport = "nfl" | "nba" | "nhl" | "ncaab";

export const LIVE_PATHS: Record<LiveSport, string> = {
  nfl: "football/nfl",
  nba: "basketball/nba",
  nhl: "hockey/nhl",
  ncaab: "basketball/mens-college-basketball",
};

export const isLiveSport = (s: unknown): s is LiveSport =>
  typeof s === "string" && Object.prototype.hasOwnProperty.call(LIVE_PATHS, s);

export type LiveTeam = {
  name: string;
  abbreviation: string;
  score: number | null;
};

export type LiveGame = {
  id: string;
  start: string;
  /** pre: not started, in: in progress (including halftime/intermission), post: final. */
  state: "pre" | "in" | "post";
  /** ESPN's short status: "Q3 4:12", "2nd Period", "Halftime", "Final/OT". */
  detail: string;
  away: LiveTeam;
  home: LiveTeam;
};

const obj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const list = (v: unknown): Record<string, any>[] =>
  Array.isArray(v) ? v.map(obj) : [];
const score = (v: unknown) =>
  typeof v === "string" && /^\d+$/.test(v)
    ? Number(v)
    : typeof v === "number" && Number.isInteger(v)
      ? v
      : null;

/** ESPN scoreboard → games. Anything malformed is dropped, never guessed. */
export function parseScoreboard(data: unknown): LiveGame[] {
  return list(obj(data).events).flatMap((e) => {
    const c = list(e.competitions)[0];
    const type = obj(obj(e.status || c?.status).type);
    const side = (homeAway: string) => {
      const t = list(c?.competitors).find((x) => x.homeAway === homeAway);
      const team = obj(t?.team);
      return t && team.displayName
        ? {
            name: String(team.displayName),
            abbreviation: String(
              team.abbreviation || team.shortDisplayName || team.displayName,
            ),
            score: score(t.score),
          }
        : null;
    };
    const away = side("away"),
      home = side("home");
    const state = type.state;
    if (
      !/^\d+$/.test(String(e.id)) ||
      !away ||
      !home ||
      !["pre", "in", "post"].includes(state)
    )
      return [];
    const start = c?.date || e.date;
    if (!Number.isFinite(Date.parse(start))) return [];
    return [
      {
        id: String(e.id),
        start: new Date(start).toISOString(),
        state,
        detail: String(type.shortDetail || type.detail || ""),
        away: state === "pre" ? { ...away, score: null } : away,
        home: state === "pre" ? { ...home, score: null } : home,
      },
    ];
  });
}

/** Today's ET date and yesterday's: a game that runs past midnight ET is filed under its start day. */
export function scoreboardDays(now = Date.now()) {
  return [now - 86400000, now].map((t) =>
    new Date(t)
      .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
      .replaceAll("-", ""),
  );
}

export const FINAL_WINDOW_MS = 12 * 3600000;

/**
 * What the strip shows: every game in progress (earliest start first), then finals that ended in the
 * last 12 hours, newest first. `limit` keeps college's 150-game nights readable; games our members
 * have a stake in (`priority`) are kept first.
 */
export function liveStrip(
  games: LiveGame[],
  now = Date.now(),
  limit = 12,
  priority: (g: LiveGame) => boolean = () => false,
) {
  const seen = new Set<string>();
  const unique = games.filter((g) => !seen.has(g.id) && seen.add(g.id));
  const byPriority = (a: LiveGame, b: LiveGame) =>
    Number(priority(b)) - Number(priority(a));
  const live = unique
    .filter((g) => g.state === "in")
    .sort(
      (a, b) => byPriority(a, b) || Date.parse(a.start) - Date.parse(b.start),
    );
  const finals = unique
    .filter(
      (g) =>
        g.state === "post" &&
        now - Date.parse(g.start) <= FINAL_WINDOW_MS + 4 * 3600000,
    )
    .sort(
      (a, b) => byPriority(a, b) || Date.parse(b.start) - Date.parse(a.start),
    );
  return {
    live: live.slice(0, limit),
    finals: finals.slice(0, Math.max(0, Math.min(6, limit - live.length))),
    more: Math.max(0, live.length - limit),
  };
}

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** The same game on our slate: identical team pair and a start within six hours. */
export function sameGame(
  g: LiveGame,
  ours: { away: string; home: string; start: string },
) {
  return (
    key(g.away.name) === key(ours.away) &&
    key(g.home.name) === key(ours.home) &&
    Math.abs(Date.parse(g.start) - Date.parse(ours.start)) <= 6 * 3600000
  );
}

/** NHL and college matchup pages use the collector's slug: away and home abbreviations plus the ESPN id. */
export const sportGameHref = (sport: "nhl" | "ncaab", g: LiveGame) =>
  `/${sport}/games/${encodeURIComponent(
    `${g.away.abbreviation}-${g.home.abbreviation}-${g.id}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, ""),
  )}`;
