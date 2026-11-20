/**
 * Line movement: a player's line at one book from the first stored snapshot to the latest, with
 * each change in between. Built from the prop snapshots the slate already reads (nba_observations,
 * kind "prop"); recorded times only, never inferred.
 */
import type { Market } from "./nba-research-tab";

export type LinePoint = {
  at: string;
  line: number;
  over: number | null;
  under: number | null;
};
export type LineMove = {
  book: string;
  open: LinePoint;
  now: LinePoint;
  /** now.line - open.line (half-points). */
  delta: number;
  /** Every snapshot where the line or a price changed, oldest first (open and now included). */
  steps: LinePoint[];
};

type Snapshot = {
  recorded_at: string;
  observed_at?: string | null;
  payload: {
    book?: string;
    market?: string;
    provider_updated_at?: string;
    outcomes?: {
      name?: string;
      description?: string;
      point?: number;
      price?: number;
    }[];
  };
};

/** The book's implied chance for American odds. */
const implied = (odds: number) =>
  odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
/** How far apart the two sides' implied chances are: the main line is the closest to even. */
const balance = (p: { over: number | null; under: number | null }) =>
  p.over == null || p.under == null
    ? Infinity
    : Math.abs(implied(p.over) - implied(p.under));

/**
 * One snapshot's main line per player: the half-point line quoted on both sides, and when several
 * are, the one with the most balanced prices.
 */
function mainLines(s: Snapshot) {
  const byPlayer = new Map<string, Map<number, LinePoint>>();
  const at = s.observed_at || s.payload.provider_updated_at || s.recorded_at;
  for (const o of s.payload.outcomes || []) {
    const player = (o.description || "").trim();
    if (
      !player ||
      typeof o.point !== "number" ||
      (o.point * 2) % 2 !== 1 ||
      typeof o.price !== "number" ||
      (o.name !== "Over" && o.name !== "Under")
    )
      continue;
    const lines = byPlayer.get(player) || new Map<number, LinePoint>();
    const p = lines.get(o.point) || {
      at,
      line: o.point,
      over: null,
      under: null,
    };
    if (o.name === "Over") p.over = o.price;
    else p.under = o.price;
    lines.set(o.point, p);
    byPlayer.set(player, lines);
  }
  const out = new Map<string, LinePoint>();
  for (const [player, lines] of byPlayer) {
    const both = [...lines.values()].filter(
      (p) => p.over != null && p.under != null,
    );
    if (!both.length) continue;
    both.sort((a, b) => balance(a) - balance(b) || a.line - b.line);
    out.set(player, both[0]);
  }
  return out;
}

/** `${market}|${player}` → movement at `book`, from every stored snapshot of that book. */
export function lineMoves(snapshots: Snapshot[], book = "FanDuel") {
  const series = new Map<string, LinePoint[]>();
  const ordered = snapshots
    .filter(
      (s) =>
        s.payload?.book === book &&
        (s.payload.market === "player_points" ||
          s.payload.market === "player_rebounds"),
    )
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  for (const s of ordered) {
    const market = s.payload.market as Market;
    for (const [player, p] of mainLines(s)) {
      const key = `${market}|${player}`;
      const list = series.get(key) || [];
      const last = list[list.length - 1];
      if (
        !last ||
        last.line !== p.line ||
        last.over !== p.over ||
        last.under !== p.under
      )
        list.push(p);
      series.set(key, list);
    }
  }
  const moves = new Map<string, LineMove>();
  for (const [key, steps] of series) {
    const open = steps[0],
      now = steps[steps.length - 1];
    moves.set(key, { book, open, now, delta: now.line - open.line, steps });
  }
  return moves;
}

/** "+1" / "-0.5" / "0". */
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
