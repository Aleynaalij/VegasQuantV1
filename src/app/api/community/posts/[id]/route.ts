import { z } from "zod";
import { appOrigin, requestUser } from "@/lib/billing-server";
import { COMMUNITY_PHOTO_BUCKET, photoPath } from "@/lib/community-photo";
const reply = (data: object, status: number) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("origin") !== appOrigin())
    return reply({ error: "Invalid origin." }, 403);
  const auth = await requestUser(req);
  if (!auth) return reply({ error: "Sign in." }, 401);
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return reply({ error: "Invalid post." }, 400);
  const row = await auth.db
    .from("community_posts")
    .select("id,user_id,photo_path")
    .eq("id", id)
    .maybeSingle();
  if (row.error || !row.data) return reply({ error: "Post unavailable." }, 404);
  if (row.data.user_id !== auth.user.id) {
    const admin = await auth.db.rpc("is_admin");
    if (admin.error || admin.data !== true)
      return reply({ error: "You cannot remove this post." }, 403);
  }
  if (row.data.photo_path) {
    if (row.data.photo_path !== photoPath(row.data.user_id, id))
      return reply({ error: "Photo reference invalid." }, 409);
    const removed = await auth.db.storage
      .from(COMMUNITY_PHOTO_BUCKET)
      .remove([row.data.photo_path]);
    if (removed.error)
      return reply(
        { error: "Photo cleanup failed. Post remains; retry removal." },
        503,
      );
  }
  const removed = await auth.db
    .from("community_posts")
    .delete()
    .eq("id", id)
    .select("id");
  if (removed.error || !removed.data?.length)
    return reply({ error: "Post removal failed. Retry." }, 409);
  return reply({ deleted: true }, 200);
}
