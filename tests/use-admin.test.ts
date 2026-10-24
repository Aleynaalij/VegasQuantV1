import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "@supabase/supabase-js";
import { sessionKey } from "../src/lib/use-admin";

const jwt = (claims: object) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
const session = (id: string, aal: string) =>
  ({ user: { id }, access_token: jwt({ sub: id, aal }) }) as unknown as Session;

test("completing MFA in the same account changes the admin cache key", () => {
  assert.notEqual(
    sessionKey(session("u1", "aal1")),
    sessionKey(session("u1", "aal2")),
  );
  assert.equal(sessionKey(session("u1", "aal2")), "u1:aal2");
});

test("signed out has no key", () => {
  assert.equal(sessionKey(null), null);
});
