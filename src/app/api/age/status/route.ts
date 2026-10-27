import {
  ageRequestUser,
  identityConfigured,
  synchronizeAge,
  type AgeAttempt,
} from "@/lib/age-server";
import { serviceDb } from "@/lib/billing-server";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  try {
    const auth = await ageRequestUser(req);
    if (!auth) return reply({ error: "Sign in with a confirmed email." }, 401);
    const initial = await auth.db.rpc("age_verification_status");
    if (initial.error) throw Error("Unavailable");
    if (identityConfigured() && !initial.data.verified) {
      const r = await serviceDb().rpc("age_check_latest", {
        p_user: auth.user.id,
      });
      if (r.error) throw Error("Unavailable");
      const attempt = r.data as AgeAttempt | null;
      // Database result retrieval is limited to one provider poll per 30 seconds.
      if (
        attempt?.provider_session &&
        (!attempt.checked_at ||
          Date.now() - Date.parse(attempt.checked_at) >= 30000)
      )
        await synchronizeAge(auth.user.id, attempt);
    }
    const r = await auth.db.rpc("age_verification_status");
    if (r.error) throw Error("Unavailable");
    return reply({ ...r.data, provider_available: identityConfigured() });
  } catch {
    return reply(
      {
        error:
          "Age verification status is unavailable. Access cannot be verified; retry shortly.",
      },
      503,
    );
  }
}
