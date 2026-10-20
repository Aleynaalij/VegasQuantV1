import type { NbaGame } from "./nba-board";
export type NbaEditorialPick = {
  id: string;
  publication_key: string;
  game_id: string;
  player: string;
  market: "player_points" | "player_rebounds";
  direction: "Over" | "Under";
  line: number;
  odds: number;
  book: string;
  rationale: string;
  risk: string;
  unknowns: string;
  sources: { label: string; url: string }[];
  evidence_sources: { url: string; sha256: string; retrieved_at: string }[];
  supersedes_id: string | null;
  published_at: string;
  expires_at: string;
  quote_observed_at: string;
  quote_recorded_at: string;
  quote_source_url: string;
  game: NbaGame | null;
};
export function nbaEditorialSources(
  p: Pick<NbaEditorialPick, "sources" | "evidence_sources">,
) {
  return (p.evidence_sources || [])
    .filter((s) => s.url.startsWith("https://"))
    .map((s) => ({
      ...s,
      label:
        p.sources.find((c) => c.url === s.url)?.label || "Recorded source data",
    }));
}
export function nbaEditorialMarket(
  p: Pick<NbaEditorialPick, "market" | "direction" | "line">,
) {
  return `${p.direction} ${p.line} ${p.market === "player_points" ? "points" : "rebounds"}`;
}
export function nbaEditorialCopy(
  p: Pick<NbaEditorialPick, "player" | "market" | "direction" | "line">,
) {
  return `${p.player} ${nbaEditorialMarket(p).toLowerCase()}`;
}
export function nbaEditorialOpen(
  p: NbaEditorialPick,
  now: number,
  superseded: boolean,
) {
  return (
    !superseded &&
    !!p.game &&
    !p.game.tipoff_tbd &&
    !/FINAL|IN_PROGRESS|HALFTIME|END_PERIOD|CANCEL|POSTPON|SUSPEND/.test(
      p.game.status || "",
    ) &&
    now < Math.min(Date.parse(p.expires_at), Date.parse(p.game.tipoff))
  );
}
