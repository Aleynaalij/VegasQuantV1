// Vercel refuses function request bodies over 4.5 MB before /api/community/photo runs, and
// full-screen phone screenshots are often larger. The browser therefore downscales to the same
// bounds the server applies (prepareCommunityPhoto) before uploading; the server still decodes,
// strips metadata and re-encodes every photo.
export const MAX_SELECTED_PHOTO_BYTES = 25_000_000;
export const MAX_REQUEST_PHOTO_BYTES = 4_400_000;
const MAX_WIDTH = 2048,
  MAX_HEIGHT = 4096;

export function fitInside(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function shrinkPhoto(file: Blob): Promise<Blob> {
  if (file.size <= 1_000_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitInside(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // Transparent PNG areas become white, as the server's flatten does.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Uploads a community photo and returns its storage path, or throws a readable error. */
export async function uploadCommunityPhoto(
  file: Blob,
  post: string,
  accessToken: string,
  send: typeof fetch = fetch,
  shrink: (file: Blob) => Promise<Blob> = shrinkPhoto,
): Promise<string> {
  if (file.size > MAX_SELECTED_PHOTO_BYTES)
    throw Error("Choose a screenshot under 25 MB.");
  const photo = await shrink(file);
  if (photo.size > MAX_REQUEST_PHOTO_BYTES)
    throw Error(
      "This screenshot is too large to upload. Crop it to the slip and retry.",
    );
  const body = new FormData();
  body.set("photo", photo, "photo.jpg");
  const response = await send(`/api/community/photo?post=${post}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!data)
    throw Error(
      response.status === 413
        ? "This screenshot is too large to upload. Crop it to the slip and retry."
        : "Screenshot upload could not complete. Please retry.",
    );
  if (!response.ok || typeof data.path !== "string")
    throw Error(data.error || "Screenshot upload failed.");
  return data.path;
}
