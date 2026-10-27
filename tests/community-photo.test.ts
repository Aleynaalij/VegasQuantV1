import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareCommunityPhoto } from "../src/lib/community-photo-server";
import {
  photoPath,
  eraseCommunityPhotos,
  readLimitedBody,
} from "../src/lib/community-photo";
const owner = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000002";
test("photo processing strips metadata and retains the complete tall slip", async () => {
  const input = await sharp({
    create: { width: 600, height: 2400, channels: 3, background: "red" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "Private name" } })
    .toBuffer();
  assert.ok((await sharp(input).metadata()).exif);
  const output = await prepareCommunityPhoto(input);
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 2400);
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
});
test("invalid image bytes, SVG and oversized uploads cannot become community photos", async () => {
  for (const bytes of [
    new Uint8Array([1, 2, 3]),
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    ),
    new Uint8Array(5_000_001),
  ])
    await assert.rejects(prepareCommunityPhoto(bytes));
});
test("photo cleanup verifies every owner before deletion and aborts on storage failure", async () => {
  const calls: string[][] = [];
  const own = photoPath(owner, id);
  await assert.rejects(
    eraseCommunityPhotos(owner, [own, photoPath(id, owner)], async (paths) => {
      calls.push(paths);
      return { error: null };
    }),
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    eraseCommunityPhotos(owner, [own], async () => ({
      error: new Error("offline"),
    })),
  );
  await eraseCommunityPhotos(owner, [own], async (paths) => {
    calls.push(paths);
    return { error: null };
  });
  assert.deepEqual(calls, [[own]]);
});
test("upload reader enforces size even without a content-length header", async () => {
  const req = new Request("https://vegasquant.app/api/community/photo", {
    method: "POST",
    body: new Uint8Array(20),
  });
  await assert.rejects(readLimitedBody(req, 10));
  const small = new Request("https://vegasquant.app/api/community/photo", {
    method: "POST",
    body: new Uint8Array([1, 2]),
  });
  assert.deepEqual(await readLimitedBody(small, 10), new Uint8Array([1, 2]));
});
