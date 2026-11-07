import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/nba/threes-card/[day]/route";

test("daily card keeps transient failures separate from missing data and renders a recovered PNG", async () => {
  const original = globalThis.fetch;
  let mode = "error";
  let calls = 0;
  globalThis.fetch = async (input) => {
    assert.match(
      String(input instanceof Request ? input.url : input),
      /\/rpc\/nba_threes_card$/,
    );
    calls++;
    if (mode === "throw") throw new Error("Synthetic network failure");
    if (mode === "error")
      return Response.json(
        { message: "Synthetic upstream error" },
        { status: 503 },
      );
    if (mode === "empty") return Response.json(null);
    return Response.json({
      day: "2026-11-07",
      games: [{ away: "AAA", home: "BBB", tipoff: "2026-11-08T00:00:00Z" }],
      attempted: [
        { player: "Synthetic Player", team: "AAA", games: 3, tpa: 8, tpm: 3 },
      ],
      made: [
        { player: "Synthetic Player", team: "AAA", games: 3, tpa: 8, tpm: 3 },
      ],
    });
  };
  const get = (day = "2026-11-07") =>
    GET(new Request(`https://example.test/${day}`), {
      params: Promise.resolve({ day }),
    });
  try {
    assert.equal((await get("2026-02-30")).status, 404);
    assert.equal(calls, 0);
    for (mode of ["error", "throw"]) {
      const res = await get();
      assert.equal(res.status, 503);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      assert.equal(res.headers.get("Retry-After"), "2");
    }
    mode = "empty";
    const missing = await get();
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("Cache-Control"), "no-store");
    mode = "ok";
    const recovered = await get();
    assert.equal(recovered.status, 200);
    assert.match(recovered.headers.get("Content-Type") || "", /image\/png/);
    const png = Buffer.from(await recovered.arrayBuffer());
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
  } finally {
    globalThis.fetch = original;
  }
});
