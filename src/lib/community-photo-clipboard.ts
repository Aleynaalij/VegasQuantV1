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

const PASTE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** The first screenshot in a paste event (long-press Paste, Ctrl/Cmd+V), or null. */
export function pastedPhoto(data: DataTransfer | null): File | null {
  for (const f of Array.from(data?.files || []))
    if (PASTE_TYPES.includes(f.type)) return f;
  return null;
}

/**
 * The screenshot on the clipboard, read when the member taps Paste (the browser may ask first).
 * null when the clipboard holds no image; throws when this browser blocks reading it.
 */
export async function clipboardPhoto(): Promise<File | null> {
  if (!navigator.clipboard?.read) throw Error("Clipboard reading unsupported");
  for (const item of await navigator.clipboard.read()) {
    const type = PASTE_TYPES.find((t) => item.types.includes(t));
    if (!type) continue;
    const blob = await item.getType(type);
    return new File([blob], `pasted.${type.split("/")[1]}`, { type });
  }
  return null;
}
