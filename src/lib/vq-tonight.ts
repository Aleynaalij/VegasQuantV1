// VQ Tonight: today's games across sports from the readers Home already uses, on the Eastern-time
// product day. Pure helpers only; the component does the reads (see docs/product/vq-tonight-spec.md).
import type { Sport } from "./sports";

export type TonightGame = {
  sport: Sport;
  id: string;
  away: string;
  home: string;
  start: string; // scheduled start, ISO
  tbd: boolean;
  status: string | null; // provider status, as reported
  href: string; // the game's existing page
};

/** New York wall-clock parts for an instant. */
function etParts(t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}
const etOffset = (t: number) => {
  const p = etParts(t);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(t / 1000) * 1000;
};
/** UTC ms of ET midnight on the given ET calendar date, using the offset in force at that midnight. */
function etMidnight(y: number, m: number, d: number) {
  const wall = Date.UTC(y, m - 1, d);
  let t = wall - etOffset(wall);
  for (let i = 0; i < 2; i++) t = wall - etOffset(t);
  return t;
}

/** The product day containing `now`: [ET midnight, next ET midnight). 23 or 25 hours on DST days. */
export function tonightWindow(now: number) {
  const p = etParts(now);
  const start = etMidnight(p.y, p.m, p.d);
  const end = etMidnight(p.y, p.m, p.d + 1);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
  }).format(new Date(now));
  return { start, end, label };
}

/** A plain label for a reported status; null when it is simply scheduled. Never invents a state. */
export function statusLabel(status: string | null | undefined): string | null {
  const s = (status || "").toUpperCase();
  if (!s) return null;
  if (/POSTPON/.test(s)) return "Postponed";
  if (/CANCEL/.test(s)) return "Cancelled";
  if (/SUSPEND/.test(s)) return "Suspended";
  if (/FINAL/.test(s)) return "Final";
  if (/IN_PROGRESS|HALFTIME|END_PERIOD|LIVE/.test(s)) return "In progress";
  return null;
}

/**
 * Today's games: scheduled start inside the ET day, sorted by start then id. A game whose time is
 * not confirmed stays in only when its date is today, and is labelled rather than given a time.
 */
export function tonightGames(rows: TonightGame[], now: number): TonightGame[] {
  const w = tonightWindow(now);
  const seen = new Set<string>();
  return rows
    .filter((g) => {
      const t = Date.parse(g.start);
      const key = `${g.sport}:${g.id}`;
      if (!Number.isFinite(t) || t < w.start || t >= w.end || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.sport.localeCompare(b.sport) || a.id.localeCompare(b.id));
}

export function startLabel(g: TonightGame) {
  if (g.tbd) return "Time not confirmed";
  return `${new Date(g.start).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
}

const slugOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(s);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * NHL / college games from `sports_home`. Only a version-1 response for the requested sport is
 * accepted (null otherwise, which the caller treats as an error, never as an empty or wrong-sport
 * slate); rows without a usable identity are dropped.
 */
export function fromSportsHome(sport: "nhl" | "ncaab", data: unknown): TonightGame[] | null {
  const env = data && typeof data === "object" ? (data as { version?: unknown; sport?: unknown; games?: unknown }) : null;
  if (!env || env.version !== 1 || env.sport !== sport || !Array.isArray(env.games)) return null;
  const games = env.games as Record<string, unknown>[];
  return games.flatMap((g) => {
    const away = g.away as Record<string, unknown> | undefined, home = g.home as Record<string, unknown> | undefined;
    if (!slugOk(g.slug) || !str(g.id) || !str(g.start_time) || !away || !home) return [];
    return [{
      sport, id: str(g.id), away: str(away.short_name) || str(away.name), home: str(home.short_name) || str(home.name),
      start: str(g.start_time), tbd: g.start_time_tbd === true, status: str(g.status) || null, href: `/${sport}/games/${g.slug}`,
    }];
  });
}

/** NBA games from the public `nba_games` table. */
export function fromNbaGames(rows: unknown): TonightGame[] {
  return (Array.isArray(rows) ? rows : []).flatMap((g: Record<string, unknown>) =>
    slugOk(g.slug) && str(g.id) && str(g.tipoff)
      ? [{ sport: "nba" as const, id: str(g.id), away: str(g.away_team), home: str(g.home_team), start: str(g.tipoff),
          tbd: g.tipoff_tbd === true, status: str(g.status) || null, href: `/nba/games/${g.slug}` }]
      : []);
}

/** NFL games from the desk Home already has. */
export function fromDeskGames(rows: { id: string; slug: string; away_team: string; home_team: string; kickoff: string; sport?: string | null; kickoff_tbd?: boolean | null }[]): TonightGame[] {
  return rows.flatMap((g) =>
    (!g.sport || g.sport === "nfl") && slugOk(g.slug)
      // desk_data returns whole games rows, including the stored kickoff_tbd flag.
      ? [{ sport: "nfl" as const, id: g.id, away: g.away_team, home: g.home_team, start: g.kickoff, tbd: g.kickoff_tbd === true, status: null, href: `/matchups/${g.slug}` }]
      : []);
}
