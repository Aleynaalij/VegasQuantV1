// Next Gen Stats context for a research leg: the player's tracking metrics over his last three
// regular-season weeks before the game, set against the league's median player-week. Descriptive
// only: it adds to a leg's why and risk, never decides whether a leg is published.
import { playerName } from "../../supabase/functions/result-sync/grade.ts";
import type { Contract } from "../../supabase/functions/result-sync/grade.ts";

export type NgsRow = Record<string, string>;
export type NgsSnapshot = { stat_type: "passing" | "rushing" | "receiving"; rows: NgsRow[]; source_sha256: string; retrieved_at: string };
type LegRef = { player: string; metric: Contract["metric"]; game: { season: number; week: number; away_abbreviation: string; home_abbreviation: string } };

export const NGS_ATTRIBUTION = "NFL Next Gen Stats via nflverse (CC BY 4.0)";
export const NGS_SOURCE = { url: "https://nextgenstats.nfl.com/", label: NGS_ATTRIBUTION };
/** Games (ESPN) write Washington as WSH; NGS writes WAS. */
const ngsTeam = (abbr: string) => (abbr === "WSH" ? "WAS" : abbr);
const RECENT_WEEKS = 3;

type Metric = { key: string; label: string; weight?: string; fmt: (v: number) => string };
const yds = (v: number) => `${v.toFixed(1)} yds`;
const plus = (v: number, unit = "") => `${v > 0 ? "+" : ""}${v.toFixed(1)}${unit}`;
const pct = (v: number) => `${Math.round(v)}%`;
const METRICS: Record<NgsSnapshot["stat_type"], Metric[]> = {
  receiving: [
    { key: "avg_separation", label: "separation at the catch point", weight: "targets", fmt: yds },
    { key: "percent_share_of_intended_air_yards", label: "of his team's air yards", fmt: pct },
    { key: "catch_percentage", label: "catch rate", weight: "targets", fmt: pct },
    { key: "avg_yac_above_expectation", label: "YAC over expected per catch", weight: "receptions", fmt: (v) => plus(v) },
  ],
  rushing: [
    { key: "rush_yards_over_expected_per_att", label: "rush yards over expected per carry", weight: "rush_attempts", fmt: (v) => plus(v) },
    { key: "percent_attempts_gte_eight_defenders", label: "of carries into 8+ man boxes", weight: "rush_attempts", fmt: pct },
  ],
  passing: [
    { key: "completion_percentage_above_expectation", label: "completion % over expected", weight: "attempts", fmt: (v) => plus(v, "%") },
    { key: "avg_time_to_throw", label: "time to throw", weight: "attempts", fmt: (v) => `${v.toFixed(2)}s` },
    { key: "aggressiveness", label: "of throws into tight windows", weight: "attempts", fmt: pct },
  ],
};
const statFor = (metric: Contract["metric"]): NgsSnapshot["stat_type"] | null =>
  metric === "receiving_yards" || metric === "receptions" ? "receiving" : metric === "rushing_yards" ? "rushing" : metric === "passing_yards" ? "passing" : null;

const num = (v: string | undefined) => (v === undefined || v === "" ? NaN : Number(v));
const quantile = (xs: number[], q: number) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
/** A volume-weighted mean (targets, carries, attempts) where the metric is a per-play rate. */
const mean = (rows: NgsRow[], m: Metric) => {
  let total = 0, weight = 0;
  for (const r of rows) {
    const v = num(r[m.key]), w = m.weight ? num(r[m.weight]) : 1;
    if (!Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    total += v * w;
    weight += w;
  }
  return weight ? total / weight : NaN;
};

export type NgsContext = {
  why: string;
  risks: string[];
  evidence: Record<string, unknown> | null;
};

/**
 * The leg's NGS context, or null when the statistic has no NGS family. Only rows from before the
 * game's week count, so a later snapshot cannot leak the game itself into its own research.
 */
export function ngsContext(leg: LegRef, snapshots: NgsSnapshot[]): NgsContext | null {
  const stat = statFor(leg.metric);
  const snap = stat && snapshots.find((s) => s.stat_type === stat);
  if (!stat || !snap) return null;
  const { season, week } = leg.game;
  const prior = snap.rows.filter(
    (r) => num(r.season) === season && r.season_type === "REG" && num(r.week) >= 1 && num(r.week) < week,
  );
  const teams = new Set([ngsTeam(leg.game.away_abbreviation), ngsTeam(leg.game.home_abbreviation)]);
  const who = playerName(leg.player);
  const mine = prior
    .filter((r) => playerName(r.player_display_name || "") === who && teams.has(r.team_abbr))
    .sort((a, b) => num(b.week) - num(a.week))
    .filter((r) => num(r.week) >= week - RECENT_WEEKS);
  if (!mine.length)
    return {
      why: "",
      risks: [`No Next Gen Stats ${stat} line for him in the last ${RECENT_WEEKS} weeks (below NGS volume minimums), so his efficiency can't be checked.`],
      evidence: null,
    };
  const metrics: Record<string, { player: number; league_median: number; league_p25: number; league_p75: number }> = {};
  for (const m of METRICS[stat]) {
    const player = mean(mine, m);
    const league = prior.map((r) => num(r[m.key]));
    if (Number.isFinite(player))
      metrics[m.key] = { player, league_median: quantile(league, 0.5), league_p25: quantile(league, 0.25), league_p75: quantile(league, 0.75) };
  }
  const weeks = mine.map((r) => num(r.week)).sort((a, b) => a - b);
  const span = weeks.length === 1 ? `Week ${weeks[0]}` : `Weeks ${weeks[0]}-${weeks.at(-1)}`;
  const parts = METRICS[stat]
    .filter((m) => metrics[m.key])
    .map((m) => {
      const v = metrics[m.key];
      return `${m.fmt(v.player)} ${m.label} (league median ${m.fmt(v.league_median)})`;
    });
  const risks = ngsRisks(stat, leg.metric, metrics);
  return {
    why: parts.length ? `Next Gen Stats, ${span}: ${parts.join("; ")}.` : "",
    risks,
    evidence: {
      stat_type: stat,
      weeks,
      metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, Math.round(b * 100) / 100]))])),
      source_sha256: snap.source_sha256,
      retrieved_at: snap.retrieved_at,
      attribution: NGS_ATTRIBUTION,
    },
  };
}

/** Plain-language warnings where his tracking numbers sit in the league's weak quarter. */
function ngsRisks(stat: NgsSnapshot["stat_type"], metric: Contract["metric"], m: Record<string, { player: number; league_median: number; league_p25: number; league_p75: number }>) {
  const out: string[] = [];
  const low = (k: string) => m[k] && m[k].player < m[k].league_p25;
  const high = (k: string) => m[k] && m[k].player > m[k].league_p75;
  if (stat === "receiving") {
    if (low("avg_separation")) out.push(`He gets less separation than most receivers (${m.avg_separation.player.toFixed(1)} yds), so his catches lean on contested targets.`);
    if (metric === "receptions" && low("catch_percentage")) out.push(`He catches a smaller share of his targets than most (${Math.round(m.catch_percentage.player)}%).`);
    if (metric === "receiving_yards" && high("avg_yac_above_expectation"))
      out.push(`His yardage leans on after-catch gains well above expectation (${plus(m.avg_yac_above_expectation.player)} per catch), which tend to come back down.`);
  }
  if (stat === "rushing") {
    if (low("rush_yards_over_expected_per_att"))
      out.push(`He is gaining less than his blocking and the defense predict (${plus(m.rush_yards_over_expected_per_att.player)} yds per carry over expected).`);
    if (high("percent_attempts_gte_eight_defenders")) out.push(`He runs into stacked 8+ man boxes on ${Math.round(m.percent_attempts_gte_eight_defenders.player)}% of carries.`);
  }
  if (stat === "passing" && low("completion_percentage_above_expectation"))
    out.push(`He is completing passes below expectation (${plus(m.completion_percentage_above_expectation.player, "%")}).`);
  return out;
}
