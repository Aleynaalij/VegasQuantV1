/**
 * Home 3 (the production owner-preview Home): pure helpers for the arena layout. The component does
 * the reads; everything here is deterministic so it can be tested without a network.
 */
import type { LiveGame, LiveSport } from "./live-scores";
import { sameGame } from "./live-scores";
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
export function edgeSide(r: PropRow) {
  const over = (lean(r) || "over") === "over";
  return {
    over,
    price: over ? r.trend.over : r.trend.under,
    best: over ? r.bestOver : r.bestUnder,
    chance: r.estimate
      ? over
        ? r.estimate.chance
        : 100 - r.estimate.chance
      : null,
    edge: r.edge == null ? null : over ? r.edge : -r.edge,
    hits: r.l10 ? (over ? r.l10.hits : r.l10.n - r.l10.hits) : null,
    n: r.l10?.n ?? 0,
  };
}

/** Edge heat for styling: 3 hot, 2 warm, 1 mild, 0 none. */
export function heat(edge: number | null) {
  if (edge == null) return 0;
  if (edge >= 6) return 3;
  if (edge >= 3) return 2;
  return edge > 0 ? 1 : 0;
}

/**
 * Tonight's best edges for the rail: fresh lines only, games not yet started, one card per player
 * (the stronger of their markets), strongest first. Stale or edge-less rows never lead.
 */
export function topEdges(rows: PropRow[], now: number, limit = 8) {
  const best = new Map<string, { r: PropRow; edge: number }>();
  for (const r of rows) {
    if (r.stale || Date.parse(r.game.tipoff) <= now) continue;
    const edge = edgeSide(r).edge;
    if (edge == null || edge <= 0) continue;
    const id = r.player.athlete_id;
    const prev = best.get(id);
    if (!prev || edge > prev.edge) best.set(id, { r, edge });
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.edge - a.edge || a.r.trend.player.localeCompare(b.r.trend.player),
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
  phase: "live" | "upcoming" | "final";
};

/** Tonight's games with any matching live score, live first, then upcoming by start, then finals. */
export function board(
  games: TonightGame[],
  live: Partial<Record<LiveSport, LiveGame[]>>,
): BoardRow[] {
  const rank = { live: 0, upcoming: 1, final: 2 } as const;
  return games
    .map((g) => {
      const match =
        (live[g.sport as LiveSport] || []).find((l) =>
          sameGame(l, { away: g.away, home: g.home, start: g.start }),
        ) || null;
      const phase: BoardRow["phase"] =
        match?.state === "in"
          ? "live"
          : match?.state === "post" || /FINAL/i.test(g.status || "")
            ? "final"
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
 * The #1 edge as a sentence: how often the player cleared the line, our estimate for the side and
 * the book's no-vig chance for it. Null when the numbers to tell it are missing.
 */
export function headline(r: PropRow) {
  const s = edgeSide(r);
  if (s.chance == null || r.fair == null || s.edge == null) return null;
  const book = s.over ? r.fair : 100 - r.fair;
  const stat = r.trend.market === "player_points" ? "points" : "rebounds";
  const form =
    s.hits != null && s.n
      ? `${r.trend.player} has gone ${s.over ? "over" : "under"} ${r.trend.line} ${stat} in ${s.hits} of his last ${s.n}.`
      : `${r.trend.player} faces a ${r.trend.line}-${stat} line tonight.`;
  return {
    form,
    case: `We make the ${s.over ? "over" : "under"} ${s.chance}%; the book's fair price says ${book}%.`,
    edge: s.edge,
  };
}
