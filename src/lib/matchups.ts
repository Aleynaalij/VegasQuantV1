import { z } from "zod";
export const matchupStatuses = [
  "NOT ANALYZED",
  "INITIAL ANALYSIS",
  "MONITORING",
  "TARGET IDENTIFIED",
  "WAITING FOR PRICE",
  "WAITING FOR INJURY NEWS",
  "WAITING FOR WEATHER",
  "MARKET MOVED",
  "PASS",
  "OFFICIAL PLAY",
] as const;
export const updateTypes = [
  "INITIAL ANALYSIS",
  "MORNING UPDATE",
  "EVENING UPDATE",
  "INJURY UPDATE",
  "WEATHER UPDATE",
  "MARKET UPDATE",
  "GAME DAY UPDATE",
  "FINAL PRE-KICK UPDATE",
  "OFFICIAL PICK UPDATE",
] as const;
const text = z.string().max(15000),
  optional = text.optional(),
  number = z.number().finite();
export const targetSchema = z
  .object({
    market_type: text,
    player_name: optional,
    selection: text.min(1),
    current_number: optional,
    current_odds: number.refine((n) => Math.abs(n) >= 100).optional(),
    target_number: optional,
    playable_number: optional,
    pass_number: optional,
    model_probability: number.min(0).max(100).optional(),
    market_probability: number.min(0).max(100).optional(),
    edge: number.optional(),
    estimated_ev: optional,
    confidence: number.min(0).max(10).optional(),
    risk: number.min(0).max(10).optional(),
    predicted_close: optional,
    status: z.enum([
      "WATCH",
      "INTEREST",
      "BETTABLE",
      "WAIT",
      "PRICE LOST",
      "INJURY DEPENDENT",
      "WEATHER DEPENDENT",
      "PASS",
      "OFFICIAL",
    ]),
    why_we_like_it: optional,
    what_we_are_waiting_for: optional,
    why_it_could_lose: optional,
    rank: z.number().int().positive().optional(),
    official_pick_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (t) => t.status !== "OFFICIAL" || !!t.official_pick_id,
    "OFFICIAL must reference an already published pick",
  );
const record = z.record(z.string(), z.unknown());
export const matchupUpdateSchema = z
  .object({
    status: z.enum(matchupStatuses),
    update_type: z.enum(updateTypes),
    summary: text.min(1),
    raw_handoff: text.min(1),
    source: optional,
    what_changed: optional,
    what_unchanged: optional,
    response: optional,
    next_review: optional,
    market: record.optional(),
    model: record.optional(),
    teams: z
      .array(z.object({ team: text.min(1) }).catchall(z.unknown()))
      .optional(),
    injuries: z
      .array(
        z
          .object({
            player: text.min(1),
            tier: z.number().int().min(1).max(3).optional(),
          })
          .catchall(z.unknown()),
      )
      .optional(),
    weather: record.optional(),
    vegas: record.optional(),
    bias: record.optional(),
    sections: z.record(z.string(), text).optional(),
    targets: z.array(targetSchema).max(50).optional(),
  })
  .strict();
export type MatchupUpdate = z.infer<typeof matchupUpdateSchema>;
export type Target = z.infer<typeof targetSchema>;
export function searchMatchup(game: Record<string, unknown>, query: string) {
  const corpus =
    Object.values(game)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .join(" ")
      .toLowerCase() +
    ` week ${game.week || ""} ` +
    (game.kickoff
      ? new Date(String(game.kickoff))
          .toLocaleDateString("en-US", {
            timeZone: "America/New_York",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
          .toLowerCase()
      : "");
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => corpus.includes(token));
}
export type MatchupGame = import("./domain").Game & {
  season?: number;
  week?: number;
  away_abbreviation?: string;
  home_abbreviation?: string;
  surface?: string;
  roof?: string;
  division_game?: boolean;
  rest_differential?: string;
  travel?: string;
  schedule_source?: string;
  provider_id?: string;
  kickoff_tbd?: boolean;
};
export type MatchupAnalysis = import("./domain").Analysis & {
  intelligence?: MatchupUpdate | null;
};
export type DirectoryRow = {
  official?: boolean;
  game: MatchupGame;
  analysis: MatchupAnalysis | null;
  market: import("./domain").Market | null;
};
