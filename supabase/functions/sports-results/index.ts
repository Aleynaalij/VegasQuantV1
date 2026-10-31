import { createClient } from "@supabase/supabase-js";
import { sha256, summaryUrl } from "../sports-sync/normalize.ts";
import { parseResult } from "./parse.ts";
import { resultBatch } from "./schedule.ts";
import type { SportGame } from "../../../src/lib/sport-contract.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !token ||
    (await db.rpc("feed_authorize", { p_digest: await sha256(token) })).data !==
      true
  )
    return new Response("Unauthorized", { status: 401 });
  const now = Date.now(),
    errors: string[] = [],
    statuses: Record<string, number> = {};
  const res = await db
    .from("sports_games")
    .select("id,payload")
    .lt("start_time", new Date(now - 2 * 3600000).toISOString())
    .gt("start_time", new Date(now - 4 * 86400000).toISOString());
  if (res.error)
    return Response.json({ error: "Game read failed" }, { status: 502 });
  const ids = (res.data || []).map((g: any) => g.id);
  const progress = ids.length
    ? await db.from("sports_result_progress").select("*").in("game_id", ids)
    : { data: [], error: null };
  if (progress.error)
    return Response.json({ error: "Progress read failed" }, { status: 502 });
  const attempts = ids.length
    ? await db
        .from("sports_result_attempts")
        .select("game_id,attempted_at")
        .in("game_id", ids)
    : { data: [], error: null };
  if (attempts.error)
    return Response.json({ error: "Attempt read failed" }, { status: 502 });
  const due = resultBatch(
    res.data || [],
    progress.data || [],
    attempts.data || [],
    now,
  );
  // Persist before any source call: network, parse and save failures all rotate next time.
  if (due.length) {
    const attempted = await db.from("sports_result_attempts").upsert(
      due.map((g: any) => ({
        game_id: g.id,
        attempted_at: new Date(now).toISOString(),
      })),
      { onConflict: "game_id" },
    );
    if (attempted.error)
      return Response.json(
        { error: "Attempt scheduling failed" },
        { status: 502 },
      );
  }
  for (let i = 0; i < due.length; i += 4)
    await Promise.all(
      due.slice(i, i + 4).map(async (row: any) => {
        const game: SportGame = { ...row.payload, id: row.id };
        try {
          const url = summaryUrl(game.sport, game.provider_id);
          const r = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: {
              "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)",
              Accept: "application/json",
            },
          });
          if (!r.ok) throw Error(`Source ${r.status}`);
          const body = await r.text();
          const p = parseResult(JSON.parse(body), game, {
            url,
            sha256: await sha256(body),
            retrieved_at: new Date().toISOString(),
          });
          const saved = await db.rpc("record_sport_result", {
            p: { ...p, source: { ...p.source, body } },
          });
          if (saved.error) throw saved.error;
          const s = saved.data.status;
          statuses[s] = (statuses[s] || 0) + 1;
        } catch (e) {
          errors.push(`${game.provider_id}: ${String(e).slice(0, 120)}`);
        }
      }),
    );
  await db.from("feed_runs").insert({
    provider: "sports-results",
    status: errors.length ? "partial" : "ok",
    details: { checked: due.length, statuses, errors },
  });
  return Response.json({ checked: due.length, statuses, errors });
});
