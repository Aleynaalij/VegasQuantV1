/** Shared read contract v1. NHL/NCAAB use sports_*; NBA/NFL retain their existing stores. */
export type Sport = "nfl" | "nba" | "nhl" | "ncaab";
export type NewSport = Extract<Sport, "nhl" | "ncaab">;
export type SportSource = { url: string; sha256: string; retrieved_at: string };
export type SportTeam = {
  id: string;
  provider_id: string;
  name: string;
  short_name: string;
  abbreviation: string;
};
export type SportGame = {
  id: string;
  sport: NewSport;
  provider_id: string;
  slug: string;
  away: SportTeam;
  home: SportTeam;
  start_time: string;
  start_time_tbd: boolean;
  season: number;
  season_type: number;
  venue: string | null;
  neutral_site: boolean | null;
  status: string;
  completed: boolean;
  away_score: number | null;
  home_score: number | null;
  source: SportSource;
  updated_at: string;
};
export type SportMarket = {
  id: string;
  game_id: string;
  sport: NewSport;
  book: "FanDuel";
  market:
    | "h2h"
    | "spreads"
    | "totals"
    | "player_points"
    | "player_goals"
    | "player_goal_scorer_anytime";
  period: "full_game";
  selection: string;
  player: string | null;
  athlete_id: string | null;
  side: "home" | "away" | null;
  direction: "Over" | "Under" | "Yes" | null;
  line: number | null;
  odds: number;
  observed_at: string;
  expires_at: string;
  settlement:
    | "including_overtime"
    | "including_overtime_shootout"
    | "skater_stats_excluding_shootout";
  settlement_note: string;
  source: SportSource;
};
export type SportFact = {
  id: string;
  game_id: string;
  kind: "injury" | "roster" | "team_context" | "player_context";
  payload: Record<string, unknown>;
  source: SportSource;
};
export type SportSelection = {
  id: string;
  game_id: string;
  market_id: string;
  title: string;
  why: string;
  risk: string;
  published_at: string;
  expires_at: string;
  sources: SportSource[];
  classification: "QUALITATIVE_EDITORIAL";
  /** The exact quote the selection was published against (sports_display migration). */
  market?: SportMarket | null;
};
export type SportResult = {
  game_id: string;
  status: "AWAITING_FINAL" | "CONFIRMING" | "FINAL" | "CONFLICT" | "NO_RESULT";
  reason: string;
  checked_at: string;
};
export type SportPage = {
  version: 1;
  sport: NewSport;
  games: SportGame[];
  markets: SportMarket[];
  facts: SportFact[];
  selections: SportSelection[];
  results: SportResult[];
  /** Public schedule is available signed out; protected arrays are empty when access is false. */
  access: boolean;
  generated_at: string;
};
// RPCs: sports_slate(p_sport text, p_days integer default 7) -> SportPage;
// sports_game(p_sport text, p_slug text) -> SportPage (zero/one game);
// sports_records(p_sport text) -> {selections,win,loss,push,void,pending}.
