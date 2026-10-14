import Stripe from "stripe";
import { z } from "zod";
import { requestUser, serviceDb } from "./billing-server";
import {
  verificationOutcome,
  type AgeProviderSession,
} from "./age-verification";
export function identityConfigured() {
  return (
    process.env.AGE_VERIFICATION_ENABLED === "true" &&
    !!process.env.STRIPE_IDENTITY_RESTRICTED_KEY?.startsWith("rk_live_") &&
    !!process.env.STRIPE_IDENTITY_WEBHOOK_SECRET?.startsWith("whsec_")
  );
}
export function identityClient() {
  if (!process.env.STRIPE_IDENTITY_RESTRICTED_KEY?.startsWith("rk_live_"))
    throw Error("Identity credentials are not configured");
  return new Stripe(process.env.STRIPE_IDENTITY_RESTRICTED_KEY!, {
    maxNetworkRetries: 1,
    timeout: 12000,
  });
}
export async function ageRequestUser(req: Request) {
  const auth = await requestUser(req);
  if (!auth) return null;
  try {
    const token = req.headers.get("authorization")!.slice(7);
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    if (!z.string().uuid().safeParse(claims.session_id).success) return null;
    const live = await serviceDb().rpc("age_session_live", {
      p_user: auth.user.id,
      p_session: claims.session_id,
    });
    if (live.error || !live.data) return null;
    return { ...auth, sessionId: claims.session_id as string };
  } catch {
    return null;
  }
}
export type AgeAttempt = {
  id: string;
  user_id: string;
  provider_session: string | null;
  state: string;
  checked_at: string | null;
};
export async function synchronizeAge(user: string, attempt: AgeAttempt) {
  if (
    !attempt.provider_session ||
    ["verified", "underage", "needs_review"].includes(attempt.state)
  )
    return;
  const s = await identityClient().identity.verificationSessions.retrieve(
    attempt.provider_session,
    { expand: ["verified_outputs.dob"] },
  );
  const state = verificationOutcome(s as AgeProviderSession, user, attempt.id);
  const result = await serviceDb().rpc("finish_age_check", {
    p_user: user,
    p_attempt: attempt.id,
    p_provider: s.id,
    p_state: state,
  });
  if (result.error) throw Error("Verification could not be recorded");
}
