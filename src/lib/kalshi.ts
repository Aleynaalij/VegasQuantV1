import { nflTeamCode } from "./nfl-teams";
export type KalshiTarget = {
  player: string;
  target: number;
  stat: string;
  /** The stat's known series; "" when its series is found from Kalshi's sports catalog. */
  series: string;
};
const series: Record<string, string> = {
  "passing yards": "KXNFLPASSYDS",
  "receiving yards": "KXNFLRECYDS",
  "rushing yards": "KXNFLRSHYDS",
  receptions: "KXNFLREC",
};
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
/**
 * Player props whose Kalshi series is looked up by name in Kalshi's sports catalog: a series
 * qualifies when its ticker ends in a code or its title names the stat, and never when its title
 * names an excluded word (anytime touchdowns are not passing touchdowns).
 */
export const PROP_STATS: Record<
  string,
  { words: string[]; codes: string[]; not?: string[] }
> = {
  points: { words: ["points"], codes: ["PTS"] },
  rebounds: { words: ["rebounds"], codes: ["REB"] },
  assists: { words: ["assists"], codes: ["AST"] },
  threes: {
    words: ["threes", "3pointers", "threepointers", "3pt"],
    codes: ["3PT", "3PM"],
  },
  touchdowns: {
    words: ["touchdown", "anytimetd"],
    codes: ["TD", "ATD"],
    not: ["passing"],
  },
  "passing touchdowns": {
    words: ["passingtouchdown", "passingtd"],
    codes: ["PASSTD"],
  },
  "shots on goal": { words: ["shotsongoal"], codes: ["SOG"] },
  goals: { words: ["goals"], codes: ["GOAL", "GOALS"], not: ["shotsongoal"] },
  hits: { words: ["hits"], codes: ["HITS"] },
  strikeouts: { words: ["strikeouts"], codes: ["KS", "SO"] },
  "home runs": { words: ["homeruns"], codes: ["HR"] },
};
const PROP_ALIASES: Record<string, string> = {
  pts: "points",
  point: "points",
  reb: "rebounds",
  rebs: "rebounds",
  rebound: "rebounds",
  ast: "assists",
  assist: "assists",
  "3pt": "threes",
  "3pm": "threes",
  "3-pointers": "threes",
  "three-pointers": "threes",
  "threes made": "threes",
  "3-pointers made": "threes",
  td: "touchdowns",
  tds: "touchdowns",
  touchdown: "touchdowns",
  "anytime td": "touchdowns",
  "anytime touchdown": "touchdowns",
  "passing td": "passing touchdowns",
  "passing tds": "passing touchdowns",
  "passing touchdown": "passing touchdowns",
  sog: "shots on goal",
  goal: "goals",
  hit: "hits",
  ks: "strikeouts",
  strikeout: "strikeouts",
  hr: "home runs",
  "home run": "home runs",
};
const propStat = (s: string) => {
  const k = s.toLowerCase().replace(/\s+/g, " ").trim();
  return PROP_STATS[k] ? k : PROP_ALIASES[k] || null;
};
/** Does a catalog series (ticker and title) carry this prop stat? */
export function propSeries(stat: string, ticker: string, title: string) {
  const p = PROP_STATS[stat];
  const t = normalize(title);
  return (
    !!p &&
    /^KX(NFL|NBA|WNBA|NHL|MLB)/.test(ticker) &&
    (p.codes.some((c) => ticker.endsWith(c)) ||
      p.words.some((w) => t.includes(w))) &&
    !p.not?.some((w) => t.includes(w))
  );
}
export function kalshiTarget(
  name: string,
  market: string,
): KalshiTarget | null {
  if (/\b(half|halftime|quarter|live|under|over)\b/i.test(market)) return null;
  const line =
    market === "Player Prop"
      ? name
      : `${name} ${market.replace(/^full game\s*[·:—-]\s*/i, "")}`;
  const m =
    /^(.+?)\s+(\d+)\+\s+(passing yards|receiving yards|rushing yards|receptions|catches)$/i.exec(
      line.trim(),
    );
  if (m && +m[2] >= 1) {
    const stat = m[3].toLowerCase().replace("catches", "receptions");
    return { player: m[1].trim(), target: +m[2], stat, series: series[stat] };
  }
  // Other player props: "Name 25+ points", "Name 2+ threes", "Name anytime TD".
  const anytime =
    /^(.+?)\s+(?:to score\s+)?(?:an\s+)?anytime\s+(?:td|touchdown)(?:\s+scorer)?$/i.exec(
      line.trim(),
    );
  if (anytime)
    return {
      player: anytime[1].trim(),
      target: 1,
      stat: "touchdowns",
      series: "",
    };
  const prop = /^(.+?)\s+(\d+)\+\s+([a-z0-9 -]+?)$/i.exec(line.trim());
  const stat = prop && propStat(prop[3]);
  if (!prop || !stat || +prop[2] < 1) return null;
  return { player: prop[1].trim(), target: +prop[2], stat, series: "" };
}
export function kalshiEvent(
  target: KalshiTarget,
  game: { away_team: string; home_team: string; kickoff: string },
) {
  const code = (name: string) => {
    const c = nflTeamCode(name)?.toUpperCase();
    return c === "WSH" ? "WAS" : c === "JAX" ? "JAC" : c;
  };
  const away = code(game.away_team),
    home = code(game.home_team);
  if (!away || !home || !Number.isFinite(Date.parse(game.kickoff))) return null;
  const date = new Date(game.kickoff)
    .toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year: "2-digit",
      month: "short",
      day: "2-digit",
    })
    .replace(",", "")
    .split(" ");
  return `${target.series}-${date[2]}${date[0].toUpperCase()}${date[1]}${away}${home}`;
}
export type KalshiMarket = {
  ticker: string;
  event_ticker: string;
  title: string;
  status: string;
  market_type: string;
  rules_primary: string;
  close_time: string;
  open_time: string;
  floor_strike: number;
  strike_type: string;
};
export function exactKalshiMarket(
  target: KalshiTarget,
  event: string,
  markets: KalshiMarket[],
  now = Date.now(),
) {
  return markets.find(
    (m) =>
      m.event_ticker === event &&
      m.ticker.startsWith(event + "-") &&
      /^[A-Z0-9-]+$/.test(m.ticker) &&
      m.market_type === "binary" &&
      m.status === "active" &&
      Date.parse(m.open_time) <= now &&
      Date.parse(m.close_time) > now &&
      m.strike_type === "greater" &&
      m.floor_strike === target.target - 0.5 &&
      normalize(m.title) ===
        normalize(`${target.player}: ${target.target}+ ${target.stat}`) &&
      m.rules_primary.startsWith(
        `If ${target.player} records ${target.target}+ ${target.stat} in the `,
      ),
  );
}
export function kalshiMarketUrl(m: KalshiMarket) {
  const series = m.event_ticker.split("-")[0];
  const url = new URL(
    `https://kalshi.com/markets/${series.toLowerCase()}/x/${m.event_ticker.toLowerCase()}`,
  );
  url.searchParams.set("op_market_ticker", m.ticker);
  return url.href;
}
/**
 * A typed leg with no published game (e.g. a contributor lay): the same exact player, stat and
 * target checks as exactKalshiMarket, across every open market in the stat's series. Only markets
 * closing within TEXT_MATCH_WINDOW_MS count, so a later week's game is never offered for this one,
 * and a link is given only when exactly one market matches, so two open games are never guessed.
 */
export const TEXT_MATCH_WINDOW_MS = 4 * 86400000;
export function exactKalshiMarketForText(
  target: KalshiTarget,
  markets: KalshiMarket[],
  now = Date.now(),
) {
  const found = markets.filter(
    (m) =>
      Date.parse(m.close_time) <= now + TEXT_MATCH_WINDOW_MS &&
      (target.series
        ? exactKalshiMarket(target, m.event_ticker, [m], now) === m
        : propMarket(target, m, now)),
  );
  return found.length === 1 ? found[0] : null;
}
/**
 * A catalog prop market for this exact player and target: an open binary "N+" market whose
 * title begins with the player and target and names the stat, and whose rules name the player.
 */
function propMarket(target: KalshiTarget, m: KalshiMarket, now: number) {
  const p = PROP_STATS[target.stat];
  const title = normalize(m.title);
  return (
    !!p &&
    /^[A-Z0-9-]+$/.test(m.ticker) &&
    m.ticker.startsWith(m.event_ticker + "-") &&
    m.market_type === "binary" &&
    m.status === "active" &&
    Date.parse(m.open_time) <= now &&
    Date.parse(m.close_time) > now &&
    m.strike_type === "greater" &&
    m.floor_strike === target.target - 0.5 &&
    title.startsWith(normalize(target.player) + target.target) &&
    p.words.some((w) => title.includes(w)) &&
    !p.not?.some((w) => title.includes(w)) &&
    normalize(m.rules_primary).includes(normalize(target.player))
  );
}
