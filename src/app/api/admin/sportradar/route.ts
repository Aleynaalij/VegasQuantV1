import { z } from "zod";
import { appOrigin, requestUser } from "@/lib/billing-server";
import { fetchSportradarGame, sportradarConfig, SportradarError, sportradarStatus } from "@/lib/sportradar-nfl";
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
  return reply(sportradarStatus(sportradarConfig()));
}
const input = z.object({ game_id: z.string().uuid(), feed: z.enum(["statistics", "pbp"]) }).strict();
export async function POST(req: Request) {
  if (req.headers.get("origin") !== appOrigin()) return reply({ error: "Invalid origin." }, 403);
  if (!await authorized(req)) return reply({ error: "Verified administrator required." }, 403);
  let body: z.infer<typeof input>;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return reply({ error: "Invalid request." }, 400);
    body = input.parse(JSON.parse(raw));
  } catch { return reply({ error: "Provide the Sportradar game UUID and feed." }, 400); }
  try { return reply(await fetchSportradarGame(sportradarConfig(), body.game_id, body.feed)); }
  catch (error) {
    const code = error instanceof SportradarError ? error.code : "provider_request_failed";
    return reply({ error: code, ...sportradarStatus(sportradarConfig()) }, code === "not_configured" ? 409 : code === "provider_rate_limited" ? 429 : 502);
  }
}
