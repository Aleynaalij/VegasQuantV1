// Next Gen Stats context for a research leg: the player's tracking metrics over his last three
// regular-season weeks before the game, set against the league's median player-week. Descriptive
// only: it adds to a leg's why and risk, never decides whether a leg is published.
import { playerName } from "../../supabase/functions/result-sync/grade.ts";
import type { Contract } from "../../supabase/functions/result-sync/grade.ts";

export type NgsRow = Record<string, string>;
export type NgsSnapshot = { stat_type: "passing" | "rushing" | "receiving"; rows: NgsRow[]; source_sha256: string; retrieved_at: string };
type LegRef = {
  player: string;
  metric: Contract["metric"];
  game: { season: number; week: number; away_abbreviation: string; home_abbreviation: string };
  /** His team from his latest weekly box-score row before the game; without it there is no matchup line. */
  team?: string | null;
};

export const NGS_ATTRIBUTION = "NFL Next Gen Stats via nflverse (CC BY 4.0)";
export const NGS_SOURCE = { url: "https://nextgenstats.nfl.com/", label: NGS_ATTRIBUTION };
/** Games (ESPN) write Washington as WSH; NGS writes WAS. Older nflverse rows use legacy codes. */
const ALIASES: Record<string, string> = { WSH: "WAS", LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV" };
const ngsTeam = (abbr: string) => ALIASES[abbr] ?? abbr;
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

// Stored snapshots keep a blank NGS value as null; it is missing, never zero.
const num = (v: string | null | undefined) => (v === undefined || v === null || v === "" ? NaN : Number(v));
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
export function ngsContext(leg: LegRef, snapshots: NgsSnapshot[], schedule: ScheduleGame[] = []): NgsContext | null {
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
  // The defense he faces: the other side from his current team, taken from his weekly box-score rows
  // (every game he plays), never from NGS rows, which can predate a trade between these two teams.
  const own = leg.team ? ngsTeam(leg.team) : null;
  const opponent = own && teams.has(own) ? [...teams].find((t) => t !== own) ?? null : null;
  const defense = opponent ? defenseMatchup(stat, prior, schedule, opponent) : null;
  if (defense?.risk) risks.push(defense.risk);
  const why = [parts.length ? `Next Gen Stats, ${span}: ${parts.join("; ")}.` : "", defense?.why ?? ""].filter(Boolean).join(" ");
  return {
    why,
    risks,
    evidence: {
      stat_type: stat,
      weeks,
      defense: defense?.evidence ?? null,
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

/** One game of the schedule (ESPN team codes), to tell which defense each NGS player-week faced. */
export type ScheduleGame = { season: number; week: number; away_abbreviation: string; home_abbreviation: string };
const MIN_DEFENSE_WEEKS = 2;
const DEFENSE = {
  receiving: { key: "avg_separation", weight: "targets", label: "of separation to receivers", unit: (v: number) => yds(v),
    tight: "one of the tightest coverages in the league", soft: "one of the softest coverages in the league" },
  rushing: { key: "rush_yards_over_expected_per_att", weight: "rush_attempts", label: "rush yards over expected per carry", unit: (v: number) => plus(v),
    tight: "one of the stingiest run defenses in the league", soft: "one of the most generous run defenses in the league" },
} as const;

/**
 * How the defense he faces has treated his position so far: the volume-weighted NGS metric of every
 * opposing player-week against it in earlier weeks of the season, ranked among all defenses with at
 * least two weeks of data. Descriptive only, like the rest of the NGS context.
 */
export function defenseMatchup(stat: NgsSnapshot["stat_type"], prior: NgsRow[], schedule: ScheduleGame[], opponent: string) {
  if (stat === "passing") return null;
  const spec = DEFENSE[stat];
  const faced = new Map<string, string>();
  for (const g of schedule) {
    const away = ngsTeam(g.away_abbreviation), home = ngsTeam(g.home_abbreviation);
    faced.set(`${g.season}|${g.week}|${away}`, home);
    faced.set(`${g.season}|${g.week}|${home}`, away);
  }
  const sums = new Map<string, { value: number; weight: number; weeks: Set<number> }>();
  for (const r of prior) {
    const d = faced.get(`${num(r.season)}|${num(r.week)}|${r.team_abbr}`);
    const v = num(r[spec.key]), w = num(r[spec.weight]);
    if (!d || !Number.isFinite(v) || !Number.isFinite(w) || w <= 0) continue;
    const t = sums.get(d) ?? { value: 0, weight: 0, weeks: new Set<number>() };
    t.value += v * w;
    t.weight += w;
    t.weeks.add(num(r.week));
    sums.set(d, t);
  }
  const allowed = [...sums].filter(([, t]) => t.weeks.size >= MIN_DEFENSE_WEEKS).map(([team, t]) => ({ team, value: t.value / t.weight }));
  const mine = allowed.find((a) => a.team === opponent);
  if (!mine || allowed.length < 8) return null;
  // Rank 1 = allows the least (tightest), as a fan reads "the stingiest defense".
  const rank = allowed.filter((a) => a.value < mine.value).length + 1;
  const median = quantile(allowed.map((a) => a.value), 0.5);
  const quarter = Math.ceil(allowed.length / 4);
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const where = rank <= quarter ? spec.tight : rank > allowed.length - quarter ? spec.soft : null;
  return {
    why: `Matchup: ${opponent} allows ${spec.unit(mine.value)} ${spec.label}, ${ordinal(rank)} lowest of ${allowed.length} defenses (median ${spec.unit(median)})${where === spec.soft ? `: ${spec.soft}` : ""}.`,
    risk: where === spec.tight ? `He faces ${spec.tight} (${opponent}: ${spec.unit(mine.value)} ${spec.label}).` : null,
    evidence: { opponent, metric: spec.key, allowed: Math.round(mine.value * 100) / 100, rank, defenses: allowed.length, median: Math.round(median * 100) / 100 },
  };
}

/** His team in his latest weekly box-score row before the game (nflverse weekly player stats). */
export function currentTeam(rows: Record<string, string>[], player: string, season: number, week: number): string | null {
  const who = playerName(player);
  let best: Record<string, string> | null = null;
  for (const r of rows) {
    const s = num(r.season), w = num(r.week);
    if (r.season_type !== "REG" || !(s < season || (s === season && w < week)) || playerName(r.player_display_name || "") !== who) continue;
    if (!best || s > num(best.season) || (s === num(best.season) && w > num(best.week))) best = r;
  }
  return best?.team ? ngsTeam(best.team) : null;
}
