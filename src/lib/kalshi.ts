import { nflTeamCode } from "./nfl-teams";
export type KalshiTarget = {
  player: string;
  target: number;
  stat: string;
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
  if (!m || +m[2] < 1) return null;
  const stat = m[3].toLowerCase().replace("catches", "receptions");
  return { player: m[1].trim(), target: +m[2], stat, series: series[stat] };
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
export function kalshiMarketUrl(m: KalshiMarket, target: KalshiTarget) {
  const url = new URL(
    `https://kalshi.com/markets/${target.series.toLowerCase()}/x/${m.event_ticker.toLowerCase()}`,
  );
  url.searchParams.set("op_market_ticker", m.ticker);
  return url.href;
}
