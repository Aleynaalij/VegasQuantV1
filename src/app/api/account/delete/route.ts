import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requestUser, serviceDb, sameOrigin } from "@/lib/billing-server";
import { supabaseUrl, publishableKey } from "@/lib/supabase";
import { type ErasurePlan } from "@/lib/account-erasure-billing";
import { prepareAccountErasure } from "@/lib/account-erasure";
export const dynamic = "force-dynamic";
const input = z
  .object({
    confirmation: z.literal("DELETE"),
    password: z.string().min(1).max(1024),
  })
  .strict();
function claims(token: string): { session_id?: string; aal?: string } {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return {};
  }
}
const reply = (body: object, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Invalid origin." }, 403);
  const auth = await requestUser(req);
  if (!auth?.user.email)
    return reply(
      { error: "Sign in with your confirmed email before deleting." },
      401,
    );
  const token = req.headers.get("authorization")!.slice(7);
  const verified = claims(token); // getUser above has already authenticated this JWT.
  if (!z.string().uuid().safeParse(verified.session_id).success)
    return reply({ error: "Sign in again before deleting." }, 401);
  if (
    auth.user.factors?.some((f) => f.status === "verified") &&
    verified.aal !== "aal2"
  )
    return reply(
      { error: "Complete your two-factor sign-in before deleting." },
      403,
    );
  let body: z.infer<typeof input>;
  try {
    const raw = await req.text();
    if (raw.length > 8192)
      return reply({ error: "Invalid deletion confirmation." }, 400);
    body = input.parse(JSON.parse(raw));
  } catch {
    return reply(
      { error: "Type DELETE and enter your current password." },
      400,
    );
  }
  const reauth = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let lease: string | null = null;
  let db: ReturnType<typeof serviceDb> | null = null;
  try {
    const confirmed = await reauth.auth.signInWithPassword({
      email: auth.user.email,
      password: body.password,
    });
    if (confirmed.error || confirmed.data.user?.id !== auth.user.id)
      return reply(
        { error: "Password verification failed. No account data was deleted." },
        403,
      );
    db = serviceDb();
    const begun = await db.rpc("begin_account_erasure", {
      p_user: auth.user.id,
      p_session: verified.session_id,
    });
    if (begun.error) {
      const msg = begun.error.message;
      return reply(
        {
          error: msg.includes("administrator")
            ? "Transfer administrator access before deleting this account."
            : msg.includes("Age verification")
              ? "An age check is still initializing. Wait for it to finish or expire, then retry deletion."
              : msg.includes("initializing")
                ? "A checkout is still initializing. Wait for it to finish or expire, then retry."
                : msg.includes("already in progress")
                  ? "Deletion is already in progress. Please wait before retrying."
                  : "Deletion could not start. Sign in again and retry; no account data was deleted.",
        },
        409,
      );
    }
    const plan = begun.data as ErasurePlan;
    lease = plan.lease;
    await prepareAccountErasure(db, auth.user.id, plan);
    const revoked = await db.auth.admin.signOut(token, "global");
    if (revoked.error) throw Error("Session revocation failed");
    // The audited Auth BEFORE DELETE trigger cleans application rows in the same
    // transaction; a dependency error rolls back the database cleanup.
    const deleted = await db.auth.admin.deleteUser(auth.user.id, false);
    if (deleted.error) throw Error("Deletion failed");
    lease = null;
    return reply({ deleted: true }, 200);
  } catch {
    return reply(
      {
        error:
          "Your account was not deleted. A membership cancellation, identity redaction or photo cleanup may already have started. If identity verification is processing, wait for it to finish, then sign in and retry deletion; no refund was issued.",
      },
      503,
    );
  } finally {
    if (lease && db) {
      try {
        await db.rpc("release_account_erasure", {
          p_user: auth.user.id,
          p_lease: lease,
        });
      } catch {}
    }
    await reauth.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
