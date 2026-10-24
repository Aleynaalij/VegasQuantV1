import { z } from "zod";
import {
  ageRequestUser,
  identityConfigured,
  identityClient,
  type AgeAttempt,
  synchronizeAge,
} from "@/lib/age-server";
import { appOrigin, serviceDb, sameOrigin } from "@/lib/billing-server";
import { ageConsentVersion, safeIdentityUrl } from "@/lib/age-verification";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Invalid origin." }, 403);
  if (!identityConfigured())
    return reply(
      { error: "Independent age verification is not activated yet." },
      503,
    );
  try {
    const auth = await ageRequestUser(req);
    if (!auth) return reply({ error: "Sign in with a confirmed email." }, 401);
    const raw = await req.text();
    if (
      raw.length > 1024 ||
      !z
        .object({ consent: z.literal(ageConsentVersion) })
        .strict()
        .safeParse(JSON.parse(raw)).success
    )
      return reply({ error: "Read and accept the verification notice." }, 400);
    const db = serviceDb();
    const r = await db.rpc("begin_age_check", {
      p_user: auth.user.id,
      p_session: auth.sessionId,
      p_consent: ageConsentVersion,
    });
    if (r.error)
      return reply(
        {
          error:
            "Verification could not start. A review, active attempt or retry limit may apply.",
        },
        409,
      );
    const attempt = r.data as AgeAttempt;
    const stripe = identityClient();
    if (attempt.provider_session) {
      await synchronizeAge(auth.user.id, attempt);
      const current = await auth.db.rpc("age_verification_status");
      if (current.error) throw Error("Status unavailable");
      if (
        ["verified", "underage", "needs_review", "processing"].includes(
          current.data.state,
        )
      )
        return reply({ state: current.data.state });
    }
    const session = attempt.provider_session
      ? await stripe.identity.verificationSessions.retrieve(
          attempt.provider_session,
        )
      : await stripe.identity.verificationSessions.create(
          {
            type: "document",
            client_reference_id: auth.user.id,
            metadata: { age_attempt_id: attempt.id },
            options: {
              document: {
                require_live_capture: true,
                require_matching_selfie: true,
              },
            },
            return_url: appOrigin() + "/account/verify-age",
          },
          { idempotencyKey: "vq-age-" + attempt.id },
        );
    if (
      !session.livemode ||
      session.client_reference_id !== auth.user.id ||
      session.metadata.age_attempt_id !== attempt.id
    )
      throw Error("Provider mismatch");
    const bound = await db.rpc("bind_age_check", {
      p_user: auth.user.id,
      p_attempt: attempt.id,
      p_provider: session.id,
    });
    if (bound.error) throw Error("Binding unavailable");
    if (!session.url) return reply({ state: session.status });
    return reply({ url: safeIdentityUrl(session.url) });
  } catch {
    return reply(
      {
        error:
          "Verification could not start. No access was granted. Retry shortly.",
      },
      503,
    );
  }
}
