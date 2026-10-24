import test from "node:test";
import assert from "node:assert/strict";
import {
  fitInside,
  uploadCommunityPhoto,
  MAX_REQUEST_PHOTO_BYTES,
} from "../src/lib/community-photo-client";

const post = "00000000-0000-4000-8000-000000000002";
const keep = async (file: Blob) => file;
const blob = (bytes: number) => new Blob([new Uint8Array(bytes)]);

test("downscale bounds match the server and never enlarge", () => {
  assert.deepEqual(fitInside(1320, 2868), { width: 1320, height: 2868 });
  assert.deepEqual(fitInside(4032, 3024), { width: 2048, height: 1536 });
  assert.deepEqual(fitInside(1290, 20000), { width: 264, height: 4096 });
});

test("an upload the platform rejects as too large reads as a clear message", async () => {
  const send = (async () =>
    new Response("Request Entity Too Large", { status: 413 })) as typeof fetch;
  await assert.rejects(
    uploadCommunityPhoto(blob(10), post, "token", send, keep),
    /too large to upload/,
  );
});

test("a photo still over the request limit after shrinking is never sent", async () => {
  let sent = false;
  const send = (async () => {
    sent = true;
    return Response.json({ path: "x" });
  }) as typeof fetch;
  await assert.rejects(
    uploadCommunityPhoto(
      blob(MAX_REQUEST_PHOTO_BYTES + 1),
      post,
      "t",
      send,
      keep,
    ),
    /too large to upload/,
  );
  assert.equal(sent, false);
});

test("a large selection is shrunk before upload and returns the stored path", async () => {
  let uploaded = 0;
  const send = (async (_url: string, init: RequestInit) => {
    uploaded = ((init.body as FormData).get("photo") as Blob).size;
    return Response.json({ path: "u/p.jpg" });
  }) as typeof fetch;
  const path = await uploadCommunityPhoto(
    blob(6_000_000),
    post,
    "t",
    send,
    async () => blob(400_000),
  );
  assert.equal(path, "u/p.jpg");
  assert.equal(uploaded, 400_000);
});

test("server refusals keep their message", async () => {
  const send = (async () =>
    Response.json(
      { error: "Complete your community profile" },
      { status: 403 },
    )) as typeof fetch;
  await assert.rejects(
    uploadCommunityPhoto(blob(10), post, "t", send, keep),
    /Complete your community profile/,
  );
});
