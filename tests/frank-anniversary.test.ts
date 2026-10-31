import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  anniversaryDestination,
  anniversaryState,
} from "../src/lib/frank-anniversary.ts";

test("anniversary handoff cannot redirect off-site or accept malformed RPC state", () => {
  const token = "00000000-0000-4000-8000-000000000001";
  assert.equal(anniversaryDestination(token), `/nhl?vq-anniversary=${token}`);
  for (const value of [
    "//example.com",
    "../nba",
    `${token}&next=//example.com`,
    "",
  ])
    assert.throws(() => anniversaryDestination(value));
  for (const value of [
    null,
    {},
    { state: "revealed" },
    { state: "revealed", token: "bad" },
    { state: "offer ", token },
    { state: ["offer"] },
  ])
    assert.deepEqual(anniversaryState(value), { state: "hidden" });
});

test("Frank-only surprise persists once per account, never before release", () => {
  const r = spawnSync(process.execPath, ["tests/sql/frank-anniversary.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});
