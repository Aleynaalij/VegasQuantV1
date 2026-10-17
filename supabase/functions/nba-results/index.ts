// NBA results: reads ESPN's game summary for games past tip-off and hands each box score to
// public.record_nba_result, which checks it adds up and records it once it is unchanged for 3 hours.
// Writes only through that function and feed_runs; never touches nba_games, nba_observations or NFL.
import { createClient } from "@supabase/supabase-js";
import { resultPayload, dueGames, summaryUrl } from "./parse.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const sha = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const auth = await db.rpc("feed_authorize", { p_digest: await sha(token) });
  if (auth.error || auth.data !== true) return new Response("Unauthorized", { status: 401 });
  const now = Date.now();
  const statuses: Record<string, number> = {};
  const errors: { game: string; reason: string }[] = [];
  let checked = 0;
  try {
    const games = await db.from("nba_games").select("id,provider_id,away_team,home_team,tipoff")
      .lte("tipoff", new Date(now - 2 * 3600000).toISOString())
      .gt("tipoff", new Date(now - 4 * 86400000).toISOString());
    if (games.error) throw games.error;
    const ids = (games.data || []).map((g) => g.id);
    const progress = ids.length
      ? await db.from("nba_result_progress").select("game_id,status,checked_at").in("game_id", ids)
      : { data: [], error: null };
    if (progress.error) throw progress.error;
    const due = dueGames(games.data || [], new Map((progress.data || []).map((p) => [p.game_id, p])), now);
    for (let i = 0; i < due.length; i += 4) {
      await Promise.all(due.slice(i, i + 4).map(async (g) => {
        try {
          const r = await fetch(summaryUrl(g.provider_id), {
            signal: AbortSignal.timeout(18000),
            headers: { "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)" },
          });
          if (!r.ok) throw Error(`ESPN returned ${r.status}`);
          const text = await r.text();
          const payload = resultPayload(JSON.parse(text), g, await sha(text));
          if (typeof payload === "string") throw Error(payload);
          const saved = await db.rpc("record_nba_result", { p: payload });
          if (saved.error) throw Error(saved.error.message);
          checked++;
          const s = saved.data?.status || "UNKNOWN";
          statuses[s] = (statuses[s] || 0) + 1;
        } catch (e) {
          errors.push({ game: g.provider_id, reason: (e instanceof Error ? e.message : "Result read failed").slice(0, 160) });
        }
      }));
    }
    await db.from("feed_runs").insert({
      provider: "ESPN NBA results",
      status: errors.length ? (checked ? "partial" : "error") : "ok",
      details: { due: due.length, checked, statuses, errors },
    });
    return Response.json({ due: due.length, checked, statuses, failed: errors.length });
  } catch (e) {
    await db.from("feed_runs").insert({
      provider: "ESPN NBA results",
      status: "error",
      details: { message: (e instanceof Error ? e.message : "NBA results failed").slice(0, 200), checked, statuses },
    });
    return Response.json({ error: "NBA results failed; recorded results retained" }, { status: 502 });
  }
});
