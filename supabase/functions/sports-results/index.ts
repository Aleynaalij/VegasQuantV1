import { createClient } from "@supabase/supabase-js";
import { sha256, summaryUrl } from "../sports-sync/normalize.ts";
import { parseResult } from "./parse.ts";
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
  const map = new Map((progress.data || []).map((p: any) => [p.game_id, p]));
  const due = (res.data || [])
    .filter((g: any) => {
      const p: any = map.get(g.id);
      return (
        !p ||
        now - Date.parse(p.checked_at) >=
          (["FINAL", "CONFLICT", "NO_RESULT"].includes(p.status)
            ? 6 * 3600000
            : 15 * 60000)
      );
    })
    .sort(
      (a: any, b: any) =>
        Date.parse((map.get(a.id) as any)?.checked_at || "1970-01-01") -
        Date.parse((map.get(b.id) as any)?.checked_at || "1970-01-01"),
    )
    .slice(0, 24);
  for (let i = 0; i < due.length; i += 4)
    await Promise.all(
      due.slice(i, i + 4).map(async (row: any) => {
        const game: SportGame = { ...row.payload, id: row.id };
        try {
          const url = summaryUrl(game.sport, game.provider_id);
          const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
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
