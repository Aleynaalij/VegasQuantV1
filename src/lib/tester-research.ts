import { supabase } from "./supabase";
import type { NbaObservation } from "./nba-board";

type TesterFeature = "research" | "fear";
type TesterSection = "quotes" | "injury" | "context";
type Cursor = Pick<NbaObservation, "id" | "recorded_at">;

export function testerFeatureAccess(feature: TesterFeature) {
  return supabase.rpc("tester_feature_access", { p_feature: feature });
}

export async function testerObservationPage(
  feature: TesterFeature,
  sport: "nfl" | "nba",
  game: string,
  section: TesterSection,
  now: number,
  cursor?: Cursor,
  signal?: AbortSignal,
  client = supabase,
) {
  const query = client.rpc("tester_observation_page", {
    p_feature: feature,
    p_sport: sport,
    p_game: game,
    p_section: section,
    p_as_of: new Date(now).toISOString(),
    ...(cursor ? { p_before: cursor.recorded_at, p_after_id: cursor.id } : {}),
  });
  const result = await (signal ? query.abortSignal(signal) : query);
  if (result.error) throw result.error;
  if (!Array.isArray(result.data))
    throw Error("Tester observations unavailable");
  return result.data as NbaObservation[];
}
