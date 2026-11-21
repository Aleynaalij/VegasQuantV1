/**
 * Home 3 (the production owner-preview Home): pure helpers for the arena layout. The component does
 * the reads; everything here is deterministic so it can be tested without a network.
 */
import type { LiveGame, LiveSport } from "./live-scores";
import { sameGame } from "./live-scores";
import { statusLabel } from "./vq-tonight";
import { lean, type PropRow } from "./nba-props";
import type { Sport } from "./sports";
import type { TonightGame } from "./vq-tonight";

/** "Good morning/afternoon/evening/late night", Eastern time (the product day). */
export function greeting(now: number) {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(now)),
  );
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** The side a row leans to, with the numbers a card shows for that side. */
export function leanSide(r: PropRow) {
  const over = (lean(r) || "over") === "over";
  return {
    over,
    price: over ? r.trend.over : r.trend.under,
    best: over ? r.bestOver : r.bestUnder,
    projection: r.estimate?.projection ?? null,
    /** How far the projection sits from the line on the side shown, in points/rebounds (never negative). */
    gap: r.projGap == null ? null : Math.abs(r.projGap),
    hits: r.l10 ? (over ? r.l10.hits : r.l10.n - r.l10.hits) : null,
    n: r.l10?.n ?? 0,
  };
}

/**
 * Styling weight for a projection gap, relative to the line: 3 at a quarter of the line or more,
 * 2 at an eighth, 1 for any gap. Display only: a bigger gap is not a likelier hit.
 */
export function heat(gap: number | null, line: number) {
  if (gap == null || gap <= 0 || line <= 0) return 0;
  if (gap / line >= 0.25) return 3;
  if (gap / line >= 0.125) return 2;
  return 1;
}

/**
 * Tonight's biggest gaps between our projection and the line, for the rail: fresh lines only, games
 * not yet started, one card per player (the bigger of their markets), biggest first, in the stat's
 * own units. Stale rows and rows without a projection never lead.
 */
export function topGaps(rows: PropRow[], now: number, limit = 8) {
  const best = new Map<string, { r: PropRow; gap: number }>();
  for (const r of rows) {
    if (r.stale || Date.parse(r.game.tipoff) <= now) continue;
    const gap = leanSide(r).gap;
    if (gap == null || gap <= 0) continue;
    const id = r.player.athlete_id;
    const prev = best.get(id);
    if (!prev || gap > prev.gap) best.set(id, { r, gap });
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.gap - a.gap || a.r.trend.player.localeCompare(b.r.trend.player),
    )
    .slice(0, limit)
    .map((x) => x.r);
}

/** Longest active streaks (3+ in a row), one per player, for the "On fire" rail. */
export function hotStreaks(rows: PropRow[], now: number, limit = 6) {
  const best = new Map<string, PropRow>();
  for (const r of rows) {
    if (Date.parse(r.game.tipoff) <= now || Math.abs(r.streak) < 3) continue;
    const prev = best.get(r.player.athlete_id);
    if (!prev || Math.abs(r.streak) > Math.abs(prev.streak))
      best.set(r.player.athlete_id, r);
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        Math.abs(b.streak) - Math.abs(a.streak) ||
        a.trend.player.localeCompare(b.trend.player),
    )
    .slice(0, limit);
}

export type BoardRow = TonightGame & {
  live: LiveGame | null;
  /** "off": the schedule reports it postponed, cancelled or suspended. */
  phase: "live" | "upcoming" | "final" | "off";
};

const nameKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
/** "Golden Knights" (our NHL/college short name) is the end of "Vegas Golden Knights" (ESPN's). */
const sameTeam = (full: string, ours: string) => {
  const a = nameKey(full),
    b = nameKey(ours);
  return !!b && (a === b || a.endsWith(b) || b.endsWith(a));
};

/**
 * A live game for one of ours, always within six hours of our start: the same provider id, else
 * the exact team pair, else team names where one is the end of the other.
 */
export function liveMatch(g: TonightGame, live: LiveGame[]) {
  const near = live.filter(
    (l) => Math.abs(Date.parse(l.start) - Date.parse(g.start)) <= 6 * 3600000,
  );
  return (
    near.find((l) => l.id === g.id) ||
    near.find((l) => sameGame(l, g)) ||
    near.find(
      (l) => sameTeam(l.away.name, g.away) && sameTeam(l.home.name, g.home),
    ) ||
    null
  );
}

/** Tonight's games with any matching live score, live first, then upcoming by start, then finals. */
export function board(
  games: TonightGame[],
  live: Partial<Record<LiveSport, LiveGame[]>>,
): BoardRow[] {
  const rank = { live: 0, upcoming: 1, final: 2, off: 3 } as const;
  return games
    .map((g) => {
      const match = liveMatch(g, live[g.sport as LiveSport] || []);
      const label = statusLabel(g.status);
      const phase: BoardRow["phase"] =
        match?.state === "in"
          ? "live"
          : match?.state === "post" || label === "Final"
            ? "final"
            : label === "Postponed" ||
                label === "Cancelled" ||
                label === "Suspended"
              ? "off"
              : "upcoming";
      return { ...g, live: match, phase };
    })
    .sort(
      (a, b) =>
        rank[a.phase] - rank[b.phase] ||
        Date.parse(a.start) - Date.parse(b.start) ||
        a.away.localeCompare(b.away),
    );
}

/**
 * The board's collapsed view: the first `min` games, widened so every live game always shows (they
 * sort first). Expanded, everything.
 */
export function boardPreview<T extends { phase: BoardRow["phase"] }>(
  rows: T[],
  expanded: boolean,
  min = 5,
) {
  if (expanded) return rows;
  const live = rows.filter((r) => r.phase === "live").length;
  return rows.slice(0, Math.max(min, live));
}

/** Counts for the greeting line and sport chips. */
export function tally(rows: BoardRow[]) {
  const bySport: Partial<Record<Sport, number>> = {};
  for (const r of rows) bySport[r.sport] = (bySport[r.sport] || 0) + 1;
  return {
    games: rows.length,
    live: rows.filter((r) => r.phase === "live").length,
    bySport,
  };
}

/** Score-strip chips: live games across sports first, then the next few starts. */
export function tickerItems(rows: BoardRow[], limit = 14) {
  const live = rows.filter((r) => r.phase === "live");
  const next = rows.filter((r) => r.phase === "upcoming");
  return [...live, ...next].slice(0, limit);
}

export const odds = (p: number | null | undefined) =>
  p == null ? "—" : p > 0 ? `+${p}` : `${p}`;

/**
 * The top projection gap as a sentence: how often the player cleared the line, and where our
 * projection sits against it. Null when the numbers to tell it are missing.
 */
export function headline(r: PropRow) {
  const s = leanSide(r);
  if (s.projection == null || s.gap == null) return null;
  const stat = r.trend.market === "player_points" ? "points" : "rebounds";
  const form =
    s.hits != null && s.n
      ? `${r.trend.player} has gone ${s.over ? "over" : "under"} ${r.trend.line} ${stat} in ${s.hits} of his last ${s.n}.`
      : `${r.trend.player} faces a ${r.trend.line}-${stat} line tonight.`;
  return {
    form,
    case: `We project ${s.projection} ${stat}, ${s.gap} ${s.over ? "over" : "under"} the line.`,
    gap: s.gap,
  };
}
