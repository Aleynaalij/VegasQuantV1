// Research board selection: the strongest player-prop legs on the week's slate, from the data the
// platform already collects. A research leg is labeled as research, never as a pick: it passes the
// automatic selection rules (recent form beats the price by five points, price band, no heavy
// chalk, tight-end rule) but no validated model edge is claimed. Official picks stay behind the gate.
import { legHistory } from "../../supabase/functions/result-sync/history.ts";
import { playerName, type Contract, type Game } from "../../supabase/functions/result-sync/grade.ts";
import { bookQuotes, type Observation } from "../../supabase/functions/result-sync/prices.ts";
import { breakEven, checkLeg, verdict, bestPrices } from "../../src/lib/leg-rules.ts";
import { NGS_SOURCE, type NgsContext } from "./ngs.ts";

/** Provider market -> contract metric and the wording the grader parses. */
export const BOARD_MARKETS = {
  player_rush_yds: { metric: "rushing_yards", label: "rushing yards" },
  player_reception_yds: { metric: "receiving_yards", label: "receiving yards" },
  player_pass_yds: { metric: "passing_yards", label: "passing yards" },
  player_receptions: { metric: "receptions", label: "receptions" },
} as const;
type Base = keyof typeof BOARD_MARKETS;
const baseOf = (market: string): Base | null => {
  const b = market.replace(/_alternate$/, "");
  return b in BOARD_MARKETS ? (b as Base) : null;
};

export type BoardGame = Game & { sport: string };
export type BoardLeg = {
  game: BoardGame;
  player: string;
  metric: Contract["metric"];
  threshold: number;
  market: string;
  price: number;
  observedAt: string;
  best: { book: string; price: number } | null;
  cleared: number;
  sample: number;
  median: number;
  position: string | null;
  edge: number;
};

/** The published book; its exact line is what members can copy and what grading tracks. */
export const BOOK = "FanDuel";
/** Price band for a research leg: -150 or shorter (R2), longer than -300 (no heavy chalk). */
export const PRICE_MIN = -300;
export const PRICE_MAX = -150;
/**
 * Smallest target worth a standalone leg. A QB at 5+ rushing yards or a back at 5+ receiving yards
 * misses only on an injury or a fluke of game script, so it says nothing about the read.
 */
export const MIN_TARGET: Record<Contract["metric"], number> = {
  rushing_yards: 15,
  receiving_yards: 15,
  passing_yards: 150,
  receptions: 3,
  def_sacks: 1,
};

/**
 * Every "N+" over line the published book currently quotes for a game, as gradable contracts. Only
 * each market's latest snapshot counts; a line it has withdrawn is never revived.
 */
export function quotedLines(game: BoardGame, observations: Observation[]) {
  const latest = new Map<string, Observation>();
  for (const o of observations) {
    if (o.game_id !== game.id || o.payload.book !== BOOK || !baseOf(o.payload.market || "")) continue;
    const prior = latest.get(o.payload.market!);
    if (!prior || Date.parse(o.observed_at!) > Date.parse(prior.observed_at!)) latest.set(o.payload.market!, o);
  }
  const lines = new Map<string, Omit<Contract, "leg_key" | "team" | "period">>();
  for (const o of latest.values()) {
    const base = baseOf(o.payload.market!)!;
    const { metric, label } = BOARD_MARKETS[base];
    for (const x of o.payload.outcomes || []) {
      // "N+" targets are the over at N - 0.5; whole-number lines are not milestones.
      if (x.name !== "Over" || !x.description || !Number.isFinite(x.point)) continue;
      const threshold = x.point! + 0.5;
      if (!Number.isInteger(threshold) || threshold < MIN_TARGET[metric]) continue;
      const key = `${playerName(x.description)}|${metric}|${threshold}`;
      if (!lines.has(key))
        lines.set(key, {
          game_id: game.id,
          player: x.description,
          metric,
          threshold,
          operator: "gte",
          market: `Full game · ${threshold}+ ${label}`,
        });
    }
  }
  return [...lines.values()];
}

/**
 * Candidate research legs for one game: the published book's exact price, recent form from the
 * nflverse weekly rows, and the standing rule checks. Only legs that pass every automatic rule and
 * whose median beats the target survive; each player keeps his best edge per statistic.
 */
export function gameLegs(
  game: BoardGame,
  observations: Observation[],
  rows: Record<string, string>[],
  at: number,
): BoardLeg[] {
  const best = new Map<string, BoardLeg>();
  for (const line of quotedLines(game, observations)) {
    const c: Contract = { ...line, leg_key: "", team: "", period: "full_game" };
    const { prices } = bookQuotes(c, observations, at);
    const own = prices.find((p) => p.book === BOOK);
    if (!own || own.price > PRICE_MAX || own.price <= PRICE_MIN) continue;
    const h = legHistory(rows, c, game);
    if (typeof h === "string" || h.sample < 5 || h.median === null || h.median < c.threshold) continue;
    const form = { cleared: h.cleared, sample: h.sample, median: h.median, position: h.position };
    if (verdict(checkLeg({ price: own.price, form, market: c.market })) !== "pass") continue;
    const edge = (h.cleared / h.sample) * 100 - breakEven(own.price);
    const top = bestPrices(prices)[0];
    const leg: BoardLeg = {
      game,
      player: c.player,
      metric: c.metric,
      threshold: c.threshold,
      market: c.market,
      price: own.price,
      observedAt: own.observed_at,
      best: top && top.book !== BOOK && top.price !== own.price ? { book: top.book, price: top.price } : null,
      cleared: h.cleared,
      sample: h.sample,
      median: h.median,
      position: h.position,
      edge,
    };
    const k = `${playerName(c.player)}|${c.metric}`;
    const prior = best.get(k);
    if (!prior || edge > prior.edge || (edge === prior.edge && leg.threshold > prior.threshold)) best.set(k, leg);
  }
  return [...best.values()];
}

/** Same player and statistic in the same game, whatever the threshold: published once. */
export const selectionKey = (gameId: string, player: string, market: string) => {
  const stat = /rushing/i.test(market) ? "rush" : /receiving/i.test(market) ? "rec" : /passing/i.test(market) ? "pass" : /receptions/i.test(market) ? "recs" : "other";
  return `${gameId}|${playerName(player)}|${stat}`;
};

/**
 * The board: strongest legs first, at most `perGame` per game and `limit` overall, one leg per
 * player per game, and nothing already published.
 */
export function pickBoard(legs: BoardLeg[], published: Set<string>, limit = 8, perGame = 3) {
  const out: BoardLeg[] = [];
  const perGameCount = new Map<string, number>();
  const players = new Set<string>();
  for (const l of [...legs].sort((a, b) => b.edge - a.edge || a.price - b.price)) {
    if (out.length >= limit) break;
    if (published.has(selectionKey(l.game.id, l.player, l.market))) continue;
    if ((perGameCount.get(l.game.id) || 0) >= perGame) continue;
    const who = `${l.game.id}|${playerName(l.player)}`;
    if (players.has(who)) continue;
    players.add(who);
    perGameCount.set(l.game.id, (perGameCount.get(l.game.id) || 0) + 1);
    out.push(l);
  }
  return out;
}

const signed = (p: number) => (p > 0 ? `+${p}` : String(p));
const unit = (m: Contract["metric"]) => (m === "receptions" ? "" : " yds");

const BASE_RISK = "Research lean from recent form and the market price only; no validated model edge is claimed. Check injuries and role before kickoff.";

/**
 * The published candidate object for one research leg: structured, gradable, plainly labeled. Next
 * Gen Stats context, when there is any, is added to the why and risk; it never changes the selection.
 */
export function candidate(l: BoardLeg, ngs: NgsContext | null = null) {
  const be = Math.round(breakEven(l.price));
  const rate = Math.round((l.cleared / l.sample) * 100);
  const matchup = `${l.game.away_team} @ ${l.game.home_team}`;
  return {
    research: true,
    name: l.player,
    market: l.market,
    matchup,
    game_id: l.game.id,
    book: BOOK,
    odds: l.price,
    quote: `${BOOK} ${signed(l.price)}`,
    quote_observed_at: l.observedAt,
    copy_text: `${l.player} ${l.threshold}+ ${l.market.replace(/^Full game · \d+\+ /, "")}`,
    gambly_url: "https://gambly.com/",
    why: `Cleared ${l.threshold}+ in ${l.cleared} of the last ${l.sample} games (median ${Math.round(l.median * 10) / 10}${unit(l.metric)}): ${rate}% against the ${be}% this price needs.${l.best ? ` Best price: ${l.best.book} ${signed(l.best.price)}.` : ""}${ngs?.why ? ` ${ngs.why}` : ""}`,
    risk: [...(ngs?.risks || []), BASE_RISK].join(" "),
    analysis_kind: "RESEARCH_BOARD",
    pick_of_day: false,
    fun_play: false,
    sources: [
      { url: `https://www.espn.com/nfl/game/_/gameId/${l.game.provider_id}`, label: "ESPN game page" },
      { url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${l.game.season}.csv`, label: "nflverse weekly player stats" },
      ...(ngs?.evidence ? [NGS_SOURCE] : []),
    ],
    research_evidence: {
      cleared: l.cleared,
      sample: l.sample,
      median: l.median,
      position: l.position,
      break_even: Math.round(breakEven(l.price) * 10) / 10,
      edge_points: Math.round(l.edge * 10) / 10,
      best_book: l.best?.book ?? null,
      best_price: l.best?.price ?? null,
      source: "nflverse weekly player stats; The Odds API prop snapshots",
      ngs: ngs?.evidence ?? null,
    },
  };
}
