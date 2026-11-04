import { requestUser } from "@/lib/billing-server";
import { loadNbaLineups } from "@/lib/nba-lineups-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
export async function GET(req: Request) {
  try {
    const auth = await requestUser(req);
    if (!auth)
      return reply(
        { error: "Sign in with a confirmed email to view lineups." },
        401,
      );
    const [access, age] = await Promise.all([
      auth.db.rpc("membership_status"),
      auth.db.rpc("age_verification_status"),
    ]);
    if (
      access.error ||
      age.error ||
      typeof age.data?.required !== "boolean" ||
      typeof age.data?.verified !== "boolean"
    )
      return reply({ error: "Research access could not be checked." }, 503);
    if (
      access.data?.allowed !== true ||
      (age.data.required && !age.data.verified)
    )
      return reply(
        { error: "Research access and age verification are required." },
        403,
      );
    return reply({
      ...(await loadNbaLineups()),
      server_now: new Date().toISOString(),
    });
  } catch {
    return reply(
      {
        error:
          "Starting lineups are temporarily unavailable. Check the source before relying on player availability.",
      },
      503,
    );
  }
}
