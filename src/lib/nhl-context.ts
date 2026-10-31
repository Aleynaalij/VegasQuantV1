/** Compact, member-only pregame report. All numbers are sourced; null never means zero. */
export type NhlSource = { url: string; sha256: string; retrieved_at: string };
export type NhlSkater = {
  id: number;
  name: string;
  goals: number;
  points: number;
  appearances: number;
};
export type NhlRecentGame = {
  id: number;
  date: string;
  opponent: string;
  result: "W" | "L" | "OTL";
  goalsFor: number;
  goalsAgainst: number;
  url: string;
};
export type NhlTeamReport = {
  abbreviation: string;
  name: string;
  games: NhlRecentGame[];
  record: { wins: number; losses: number; overtimeLosses: number } | null;
  goalsForPerGame: number | null;
  goalsAgainstPerGame: number | null;
  skaters: NhlSkater[] | null;
  boxesVerified: number;
  roster: { id: number; name: string }[];
  goalie: {
    id: number | null;
    name: string;
    status: "confirmed" | "expected" | "unknown";
    sample: number;
    gaa: number | null;
    seconds: number | null;
    goalsAgainst: number | null;
    source: NhlSource;
  } | null;
  powerPlay: {
    players: { name: string; position: string }[];
    status: "projected";
    source: NhlSource;
  } | null;
  notes: string[];
};
export type NhlReport = {
  version: 1;
  game_id: string;
  cutoff: string;
  generated_at: string;
  nhl_game_id: number;
  nhl_url: string;
  teams: [NhlTeamReport, NhlTeamReport];
  sources: NhlSource[];
};
export type NhlContextResponse = {
  state: "ready" | "partial" | "waiting" | "failed" | "denied";
  report?: NhlReport;
  checked_at?: string;
  watchlist?: string | null;
};

const identity = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();
function oneEdit(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5)
    return false;
  let i = 0,
    j = 0,
    n = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++n > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return n + (a.length - i) + (b.length - j) <= 1;
}
/** Resolve private member-entered favorites only when one roster identity matches. No guessed IDs. */
export function nhlWatchlist(
  input: string | null | undefined,
  roster: { id: number; name: string }[],
) {
  const found = new Map<number, { id: number; name: string }>();
  for (const token of (input || "")
    .split(/[,\n]/)
    .map(identity)
    .filter(Boolean)) {
    const words = token.split(/\s+/);
    const matches = roster.filter((p) => {
      const name = identity(p.name).split(/\s+/),
        last = name.at(-1)!;
      return words.length === 1
        ? oneEdit(words[0], last)
        : words[0] === name[0] && oneEdit(words.at(-1)!, last);
    });
    if (matches.length === 1) found.set(matches[0].id, matches[0]);
  }
  return [...found.values()];
}
