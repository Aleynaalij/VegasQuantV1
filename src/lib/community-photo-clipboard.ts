import { supabase } from "./supabase";
import { COMMUNITY_PHOTO_BUCKET } from "./community-photo";

/** A stored community photo as PNG, the image type browsers can put on the clipboard. */
export async function communityPhotoPng(path: string): Promise<Blob> {
  const signed = await supabase.storage
    .from(COMMUNITY_PHOTO_BUCKET)
    .createSignedUrl(path, 60);
  if (signed.error) throw signed.error;
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) throw Error("Photo unavailable");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!png) throw Error("Photo could not be prepared");
  return png;
}
