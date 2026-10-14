import { z } from "zod";
import { appOrigin, requestUser } from "@/lib/billing-server";
import {
  COMMUNITY_PHOTO_BUCKET,
  MAX_UPLOAD_BODY_BYTES,
  photoPath,
  readLimitedBody,
} from "@/lib/community-photo";
import { prepareCommunityPhoto } from "@/lib/community-photo-server";
export const runtime = "nodejs";
const reply = (data: object, status: number) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (req.headers.get("origin") !== appOrigin())
    return reply({ error: "Invalid origin." }, 403);
  const auth = await requestUser(req);
  if (!auth) return reply({ error: "Sign in before uploading." }, 401);
  const id = new URL(req.url).searchParams.get("post");
  if (!z.string().uuid().safeParse(id).success)
    return reply({ error: "Invalid post." }, 400);
  const allowed = await auth.db.rpc("community_photo_access");
  if (allowed.error || allowed.data !== true)
    return reply(
      {
        error:
          "Complete your community profile and required verification before uploading.",
      },
      403,
    );
  try {
    const bytes = await readLimitedBody(req, MAX_UPLOAD_BODY_BYTES);
    const form = await new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": req.headers.get("content-type") || "" },
      body: bytes,
    }).formData();
    const file = form.get("photo");
    if (!(file instanceof File))
      return reply({ error: "Choose a JPG, PNG or WebP photo." }, 400);
    const image = await prepareCommunityPhoto(
      new Uint8Array(await file.arrayBuffer()),
    );
    const path = photoPath(auth.user.id, id!);
    const upload = await auth.db.storage
      .from(COMMUNITY_PHOTO_BUCKET)
      .upload(path, image, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "60",
      });
    if (upload.error)
      return reply(
        {
          error:
            "Upload could not save. Check your profile or wait a moment and retry.",
        },
        409,
      );
    return reply({ path }, 200);
  } catch {
    return reply(
      {
        error:
          "Photo could not be prepared. Choose a JPG, PNG or WebP under 5 MB.",
      },
      400,
    );
  }
}
