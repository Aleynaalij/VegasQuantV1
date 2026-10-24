import { z } from "zod";
import { requestUser, sameOrigin, serviceDb } from "@/lib/billing-server";
import { fetchSportradarCurrentWeek, fetchSportradarGame, sportradarConfig, SportradarError, sportradarStatus } from "@/lib/sportradar-nfl";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorized(req: Request) {
  const auth = await requestUser(req);
  if (!auth) return false;
  const admin = await auth.db.rpc("is_admin");
  return !admin.error && admin.data === true;
}
export async function GET(req: Request) {
  if (!await authorized(req)) return reply({ error: "Verified administrator required." }, 403);
  const db = serviceDb();
  const runs = await db.from("sportradar_runs").select("id,started_at,finished_at,status,calls,detail").order("started_at",{ascending:false}).limit(1).maybeSingle();
  const snapshots = await db.from("sportradar_snapshots").select("id,game_id,feed,retrieved_at,sha256,provider_last_modified").order("retrieved_at",{ascending:false}).limit(5);
  return reply({...sportradarStatus(sportradarConfig()),automatic:{latest_run:runs.data,snapshots:snapshots.data||[],error:runs.error||snapshots.error?"Automatic collector storage unavailable":null}});
}
const input = z.union([z.object({ action: z.literal("schedule") }).strict(), z.object({ game_id: z.string().uuid(), feed: z.enum(["statistics", "pbp"]) }).strict()]);
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Invalid origin." }, 403);
  if (!await authorized(req)) return reply({ error: "Verified administrator required." }, 403);
  let body: z.infer<typeof input>;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "Invalid request." }, 400);
    body = input.parse(JSON.parse(raw));
  } catch { return reply({ error: "Provide the Sportradar game UUID and feed." }, 400); }
  try {
    if ("action" in body) {
      const result = await fetchSportradarCurrentWeek(sportradarConfig());
      const week = result.payload.week as { games?: unknown[] } | undefined;
      if (!week || !Array.isArray(week.games)) throw new SportradarError("schedule_schema_unverified");
      const schema = z.object({ id: z.string().uuid(), scheduled: z.string().datetime({ offset: true }), status: z.string(), home: z.object({ alias: z.string() }), away: z.object({ alias: z.string() }) });
      const games = week.games.map(g => schema.safeParse(g)).filter(g => g.success).map(g => g.data!).sort((a,b) => Date.parse(a.scheduled) - Date.parse(b.scheduled));
      if (week.games.length && !games.length) throw new SportradarError("schedule_schema_unverified");
      const { payload: _payload, ...evidence } = result;
      return reply({ ...evidence, games, status: "schedule_received", live_freshness_verified: false });
    }
    return reply(await fetchSportradarGame(sportradarConfig(), body.game_id, body.feed));
  }
  catch (error) {
    const code = error instanceof SportradarError ? error.code : "provider_request_failed";
    return reply({ error: code, ...sportradarStatus(sportradarConfig()) }, code === "not_configured" ? 409 : code === "provider_rate_limited" ? 429 : 502);
  }
}
