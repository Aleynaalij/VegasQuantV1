import assert from "node:assert/strict";
import { test } from "node:test";
import { readStageResearch } from "../src/lib/stage-consumer-client";
test("research bridge sends only same-origin cookie reads and fails closed on denied or unavailable research", async () => {
  const data = {
    events: [],
    findings: [],
    errors: [],
    denied: false,
    signedIn: true,
    truncated: false,
  };
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "/staging/discovery/read/research");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers, undefined);
    return Response.json(data);
  };
  assert.deepEqual(await readStageResearch(request), data);
  await assert.rejects(
    readStageResearch(async () => new Response(null, { status: 403 })),
  );
  await assert.rejects(
    readStageResearch(async () => Response.json({ ...data, denied: true })),
  );
  await assert.rejects(
    readStageResearch(async () => {
      throw Error("outage");
    }),
  );
});
