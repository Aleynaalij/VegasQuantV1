import sharp from "sharp";
import { MAX_PHOTO_BYTES } from "./community-photo";
export async function prepareCommunityPhoto(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw Error("Choose a photo under 5 MB");
  const input = sharp(bytes, {
    limitInputPixels: 25_000_000,
    failOn: "warning",
    animated: false,
  });
  const metadata = await input.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    (metadata.pages || 1) > 1
  )
    throw Error("Choose a JPG, PNG or WebP photo");
  // Fresh JPEG output strips EXIF/GPS metadata; retain the complete slip, never crop.
  const result = await input
    .rotate()
    .resize({
      width: 2048,
      height: 4096,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer();
  if (result.length > MAX_PHOTO_BYTES) throw Error("Prepared photo too large");
  return result;
}
