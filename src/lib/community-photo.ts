export const COMMUNITY_PHOTO_BUCKET = "community-photos";
export const MAX_PHOTO_BYTES = 5_000_000;
export const MAX_UPLOAD_BODY_BYTES = MAX_PHOTO_BYTES + 100_000;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function photoPath(user: string, post: string) {
  if (
    !new RegExp(`^${uuid}$`, "i").test(user) ||
    !new RegExp(`^${uuid}$`, "i").test(post)
  )
    throw Error("Invalid photo identity");
  return `${user}/${post}.jpg`;
}
export async function eraseCommunityPhotos(
  user: string,
  paths: string[],
  remove: (paths: string[]) => Promise<{ error: unknown }>,
) {
  if (
    !new RegExp(`^${uuid}$`, "i").test(user) ||
    !Array.isArray(paths) ||
    paths.some((p) => !new RegExp(`^${user}/${uuid}\\.jpg$`, "i").test(p))
  )
    throw Error("Photo ownership mismatch");
  for (let offset = 0; offset < paths.length; offset += 100) {
    const result = await remove(paths.slice(offset, offset + 100));
    if (result.error) throw Error("Photo cleanup failed");
  }
}
export async function readLimitedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length")) > max)
    throw Error("Upload too large");
  const reader = req.body?.getReader();
  if (!reader) throw Error("Missing upload");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw Error("Upload too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
