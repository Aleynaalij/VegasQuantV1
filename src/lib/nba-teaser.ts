/**
 * Prop Finder free teaser: the top edges of tonight's board in a slim, public-safe shape. Built
 * server-side by the scheduled teaser job from the same rows members see (buildPropRows), so the
 * numbers match the member board exactly; only this slice is stored for non-members.
 */
import { edgeSide, topEdges } from "./home3";
import type { PropRow } from "./nba-props";

export type TeaserRow = {
  athleteId: string;
  player: string;
  team: string;
  opponent: string;
  home: boolean;
  market: "player_points" | "player_rebounds";
  line: number;
  side: "over" | "under";
  /** FanDuel's price for the side. */
  price: number | null;
  /** Our estimate for the side, percent. */
  chance: number;
  /** The book's no-vig chance for the side, percent. */
  fair: number;
  edge: number;
  hits: number | null;
  n: number;
  best: { book: string; price: number } | null;
  tipoff: string;
  gameId: string;
};
export type Teaser = {
  computedAt: string;
  /** Props on the board that have not tipped off. */
  total: number;
  rows: TeaserRow[];
};

/** The free slice of the board as of `now`: the strongest `limit` fresh, upcoming edges. */
export function buildTeaser(rows: PropRow[], now: number, limit = 2): Teaser {
  const top = topEdges(rows, now, limit);
  return {
    computedAt: new Date(now).toISOString(),
    total: rows.filter((r) => Date.parse(r.game.tipoff) > now).length,
    rows: top.flatMap((r): TeaserRow[] => {
      const s = edgeSide(r);
      if (s.chance == null || s.edge == null || r.fair == null) return [];
      return [
        {
          athleteId: r.player.athlete_id,
          player: r.trend.player,
          team:
            (r.home ? r.game.home_abbreviation : r.game.away_abbreviation) ||
            r.player.team,
          opponent: r.opponent,
          home: r.home,
          market: r.trend.market,
          line: r.trend.line,
          side: s.over ? "over" : "under",
          price: s.price ?? null,
          chance: s.chance,
          fair: s.over ? r.fair : 100 - r.fair,
          edge: s.edge,
          hits: s.hits,
          n: s.n,
          best: s.best ?? null,
          tipoff: r.game.tipoff,
          gameId: r.game.id,
        },
      ];
    }),
  };
}

/** Rows still worth showing to a visitor at `now`: not tipped off, and the snapshot under 90 min old. */
export function liveTeaserRows(t: Teaser | null, now: number) {
  if (!t || now - Date.parse(t.computedAt) > 90 * 60000) return [];
  return t.rows.filter((r) => Date.parse(r.tipoff) > now);
}
