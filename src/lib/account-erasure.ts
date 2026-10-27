import {
  COMMUNITY_PHOTO_BUCKET,
  eraseCommunityPhotos,
} from "@/lib/community-photo";
import { identityClient } from "@/lib/age-server";
import { redactIdentityAttempts } from "@/lib/age-erasure";
import { billingEnabled, serviceDb, stripeClient } from "@/lib/billing-server";
import { stopErasureBilling, type ErasurePlan } from "@/lib/account-erasure-billing";

/**
 * Everything outside the database that must be cleaned before an account row is deleted:
 * identity checks are redacted, billing stopped, community photos removed, and the erasure
 * lease marked ready. Shared by self-deletion and admin deletion; throws on any failure.
 */
export async function prepareAccountErasure(
  db: ReturnType<typeof serviceDb>,
  userId: string,
  plan: ErasurePlan,
) {
  const identityRows = await db.rpc("age_check_sessions", { p_user: userId });
  if (identityRows.error) throw Error("Identity inventory unavailable");
  if (identityRows.data?.length) {
    const identity = identityClient();
    await redactIdentityAttempts(userId, identityRows.data, {
      retrieve: (id) => identity.identity.verificationSessions.retrieve(id),
      redact: (id) => identity.identity.verificationSessions.redact(id),
    });
  }
  if (plan.subscriptions.length || plan.orders.some((o) => o.checkout_id)) {
    if (!billingEnabled()) throw Error("Billing unavailable");
    const stripe = stripeClient();
    await stopErasureBilling(userId, plan, {
      checkout: {
        retrieve: (id) => stripe.checkout.sessions.retrieve(id),
        expire: (id) => stripe.checkout.sessions.expire(id),
      },
      subscriptions: {
        retrieve: (id) => stripe.subscriptions.retrieve(id),
        cancel: (id, p) => stripe.subscriptions.cancel(id, p),
      },
    });
  }
  await eraseCommunityPhotos(userId, plan.storage_paths || [], (paths) =>
    db.storage.from(COMMUNITY_PHOTO_BUCKET).remove(paths),
  );
  const ready = await db.rpc("authorize_account_erasure", {
    p_user: userId,
    p_lease: plan.lease,
  });
  if (ready.error) throw Error("Authorization failed");
}
