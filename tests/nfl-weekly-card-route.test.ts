import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { GET } from "../src/app/api/nfl/weekly-card/[card]/route";

test("the WR PNG keeps green/yellow/red semantic tiers on the original card face", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (
      !String(input instanceof Request ? input.url : input).includes(
        "/rpc/nfl_weekly_card",
      )
    )
      return original(input, init);
    return Response.json({
      day: "2026-11-08",
      page: 1,
      pages: 2,
      throughWeek: 9,
      rows: [90, 45, 19].map((score) => ({
        player: `Synthetic Player ${score}`,
        team: "NYG",
        opponent: "PHI",
        kickoff: "2026-11-08T18:00:00Z",
        targetsPerGame: 7,
        score,
        yardsRank: 12,
      })),
    });
  };
  try {
    const response = await GET(new Request("https://example.test/card"), {
      params: Promise.resolve({ card: "nfl-wr:2026-11-08:1" }),
    });
    assert.equal(response.status, 200);
    const png = Buffer.from(await response.arrayBuffer());
    const { data, info } = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1080);
    assert.equal(info.height, 1350);
    for (const [r, g, b] of [
      [72, 213, 138],
      [242, 201, 76],
      [239, 107, 107],
    ]) {
      let count = 0;
      for (let i = 0; i < data.length; i += info.channels)
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b) count++;
      assert.ok(
        count > 100,
        `semantic color ${r},${g},${b} is visible in the actual PNG`,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
