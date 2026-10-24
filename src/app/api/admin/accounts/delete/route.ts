import { z } from "zod";
import { requestUser, sameOrigin, serviceDb } from "@/lib/billing-server";
import { type ErasurePlan } from "@/lib/account-erasure-billing";
import { prepareAccountErasure } from "@/lib/account-erasure";
export const dynamic = "force-dynamic";

// Admin-initiated account deletion. The caller must be a verified administrator (is_admin,
// which also requires two-step verification) and must type the member's email to confirm.
// Administrators and the caller's own account can never be deleted here.
const input = z
  .object({ user_id: z.string().uuid(), confirm_email: z.string().min(3).max(320) })
  .strict();
const reply = (body: object, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return reply({ error: "Invalid origin." }, 403);
  const auth = await requestUser(req);
  if (!auth) return reply({ error: "Sign in as an administrator." }, 401);
  const admin = await auth.db.rpc("is_admin");
  if (admin.error || admin.data !== true)
    return reply({ error: "Verified administrator required (complete two-step verification)." }, 403);
  let body: z.infer<typeof input>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: "Invalid request." }, 400);
    body = input.parse(JSON.parse(raw));
  } catch {
    return reply({ error: "Choose a member and type their email to confirm." }, 400);
  }
  if (body.user_id === auth.user.id)
    return reply({ error: "Delete your own account from Account, not here." }, 400);
  const db = serviceDb();
  const target = await db.auth.admin.getUserById(body.user_id);
  if (target.error || !target.data.user)
    return reply({ error: "That account no longer exists." }, 404);
  if ((target.data.user.email || "").trim().toLowerCase() !== body.confirm_email.trim().toLowerCase())
    return reply({ error: "The email you typed doesn’t match this member. Nothing was deleted." }, 400);

  let lease: string | null = null;
  try {
    const begun = await db.rpc("begin_admin_account_erasure", {
      p_admin: auth.user.id,
      p_user: body.user_id,
    });
    if (begun.error) {
      const msg = begun.error.message;
      return reply(
        {
          error: msg.includes("Administrator accounts")
            ? "Administrator accounts can’t be deleted here."
            : msg.includes("initializing")
              ? "This member has a checkout initializing. Wait a few minutes and retry."
              : msg.includes("already in progress")
                ? "Deletion is already in progress for this member."
                : "Deletion could not start. Nothing was deleted.",
        },
        409,
      );
    }
    const plan = begun.data as ErasurePlan;
    lease = plan.lease;
    await prepareAccountErasure(db, body.user_id, plan);
    // Deleting the user ends every session; the audited Auth BEFORE DELETE trigger cleans
    // application rows in the same transaction.
    const deleted = await db.auth.admin.deleteUser(body.user_id, false);
    if (deleted.error) throw Error("Deletion failed");
    lease = null;
    return reply({ deleted: true }, 200);
  } catch {
    return reply(
      {
        error:
          "The account was not deleted. Billing cancellation, identity redaction or photo cleanup may already have started; retry in a few minutes.",
      },
      503,
    );
  } finally {
    if (lease) {
      try {
        await db.rpc("release_account_erasure", { p_user: body.user_id, p_lease: lease });
      } catch {}
    }
  }
}
