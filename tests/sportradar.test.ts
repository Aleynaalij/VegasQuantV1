import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchSportradarGame, fetchSportradarCurrentWeek, sportradarStatus } from "../src/lib/sportradar-nfl";
const id = "b0563750-d49e-4362-b862-8439170dd4b7";
const config = { key: "test-only-private-key", enabled: "true", access: "trial" };
const fake = (fn: (url: string, init?: RequestInit) => Promise<Response>) => fn as typeof fetch;
test("Sportradar stays disconnected without every explicit configuration input", async () => {
  assert.equal(sportradarStatus({}).status, "not_configured");
  for (const incomplete of [{ ...config, key: undefined }, { ...config, enabled: undefined }, { ...config, access: "unknown" }]) {
    await assert.rejects(fetchSportradarGame(incomplete, id, "pbp", fake(async () => { throw Error("must not call provider"); })), /not_configured/);
  }
  assert.equal(sportradarStatus(config).live_verified, false);
  assert.ok(!JSON.stringify(sportradarStatus(config)).includes(config.key));
});
test("Sportradar requests fixed HTTPS endpoints and retains exact response evidence", async () => {
  const body = JSON.stringify({ id, status: "inprogress", quarter: 2, clock: "00:00", periods: [] });
  const snapshot = await fetchSportradarGame(config, id, "pbp", fake(async (url, init) => {
    assert.equal(url, `https://api.sportradar.com/nfl/official/trial/v7/en/games/${id}/pbp.json`);
    assert.equal(new Headers(init?.headers).get("x-api-key"), config.key);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return new Response(body, { headers: { "content-type": "application/json", "last-modified": "Thu, 22 Oct 2026 23:00:00 GMT" } });
  }));
  assert.equal(snapshot.sha256, createHash("sha256").update(body).digest("hex"));
  assert.equal(snapshot.provider_generated_at, null);
  assert.equal(snapshot.provider_last_modified, "Thu, 22 Oct 2026 23:00:00 GMT");
  assert.ok(!JSON.stringify(snapshot).includes(config.key));
});
test("Sportradar rejects path injection, invalid feeds and mismatched game payloads", async () => {
  await assert.rejects(fetchSportradarGame(config, "../league/hierarchy", "pbp"), /invalid_request/);
  await assert.rejects(fetchSportradarGame(config, id, "bad" as "pbp"), /invalid_request/);
  await assert.rejects(fetchSportradarGame(config, id, "pbp", fake(async () => Response.json({ id: "wrong", status: "closed" }))), /identity_unverified/);
  await assert.rejects(fetchSportradarGame(config, id, "statistics", fake(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }))), /schema_unverified/);
});
test("Sportradar provider errors never expose credentials or upstream response bodies", async () => {
  for (const [status, expected] of [[403, "provider_access_denied"], [429, "provider_rate_limited"], [500, "provider_request_failed"]] as const) {
    await assert.rejects(fetchSportradarGame(config, id, "statistics", fake(async () => new Response(config.key, { status }))), { message: expected });
  }
  await assert.rejects(fetchSportradarGame(config, id, "pbp", fake(async () => { throw Error(config.key); })), { message: "provider_unreachable" });
});
test("Sportradar bounds payload size and rejects invalid JSON", async () => {
  await assert.rejects(fetchSportradarGame(config, id, "pbp", fake(async () => new Response("x".repeat(8 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }))), /response_too_large/);
  await assert.rejects(fetchSportradarGame(config, id, "pbp", fake(async () => new Response("invalid", { headers: { "content-type": "application/json" } }))), /schema_unverified/);
});

test("Sportradar current-week discovery preserves source evidence and never guesses a game ID", async () => {
  const result = await fetchSportradarCurrentWeek(config, fake(async (url, init) => {
    assert.equal(url, "https://api.sportradar.com/nfl/official/trial/v7/en/games/current_week/schedule.json");
    assert.equal(new Headers(init?.headers).get("x-api-key"), config.key);
    return Response.json({ week: { games: [{ id, status: "created" }] } });
  }));
  assert.equal(result.provider_generated_at, null);
  assert.ok(result.sha256);
  assert.equal((result.payload.week as { games: unknown[] }).games.length, 1);
});
