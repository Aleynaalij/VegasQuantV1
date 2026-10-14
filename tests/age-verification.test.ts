import test from "node:test";
import assert from "node:assert/strict";
import {
  isAtLeast21,
  verificationOutcome,
  safeIdentityUrl,
  type AgeProviderSession,
} from "../src/lib/age-verification";
import { redactIdentityAttempts } from "../src/lib/age-erasure";
const at = new Date("2026-10-14T10:00:00Z");
const session = (
  extra: Partial<AgeProviderSession> = {},
): AgeProviderSession => ({
  id: "vs_fixture",
  livemode: true,
  client_reference_id: "owner",
  metadata: { age_attempt_id: "attempt" },
  type: "document",
  status: "verified",
  options: {
    document: { require_matching_selfie: true, require_live_capture: true },
  },
  verified_outputs: { dob: { year: 2005, month: 10, day: 14 } },
  ...extra,
});
test("21st birthday is measured by New York calendar date, not UTC or elapsed milliseconds", () => {
  assert.equal(
    isAtLeast21(
      { year: 2005, month: 10, day: 14 },
      new Date("2026-10-14T03:59:59Z"),
    ),
    false,
  );
  assert.equal(
    isAtLeast21(
      { year: 2005, month: 10, day: 14 },
      new Date("2026-10-14T04:00:00Z"),
    ),
    true,
  );
  assert.equal(isAtLeast21({ year: 2005, month: 10, day: 15 }, at), false);
});
test("invalid, absent and leap-day dates cannot silently pass", () => {
  assert.equal(isAtLeast21({ year: 2000, month: 2, day: 30 }, at), false);
  assert.equal(isAtLeast21({ year: null, month: 1, day: 1 }, at), false);
  assert.equal(
    isAtLeast21(
      { year: 2004, month: 2, day: 29 },
      new Date("2025-02-28T18:00:00Z"),
    ),
    false,
  );
  assert.equal(
    isAtLeast21(
      { year: 2004, month: 2, day: 29 },
      new Date("2025-03-01T18:00:00Z"),
    ),
    true,
  );
});
test("only live owned completed ID+selfie+live-capture checks can verify", () => {
  assert.equal(
    verificationOutcome(session(), "owner", "attempt", at),
    "verified",
  );
  assert.equal(
    verificationOutcome(session({ livemode: false }), "owner", "attempt", at),
    "needs_review",
  );
  assert.equal(
    verificationOutcome(
      session({
        options: {
          document: {
            require_matching_selfie: false,
            require_live_capture: true,
          },
        },
      }),
      "owner",
      "attempt",
      at,
    ),
    "needs_review",
  );
  assert.equal(
    verificationOutcome(
      session({ verified_outputs: { dob: null } }),
      "owner",
      "attempt",
      at,
    ),
    "needs_review",
  );
  assert.equal(
    verificationOutcome(
      session({ status: "processing" }),
      "owner",
      "attempt",
      at,
    ),
    "processing",
  );
  assert.equal(
    verificationOutcome(
      session({ verified_outputs: { dob: { year: 2006, month: 1, day: 1 } } }),
      "owner",
      "attempt",
      at,
    ),
    "underage",
  );
  assert.throws(() =>
    verificationOutcome(
      session({ client_reference_id: "someone-else" }),
      "owner",
      "attempt",
      at,
    ),
  );
  assert.throws(() =>
    verificationOutcome(
      session({ metadata: { age_attempt_id: "wrong" } }),
      "owner",
      "attempt",
      at,
    ),
  );
});
test("only the exact HTTPS Stripe Identity destination is accepted", () => {
  assert.equal(
    safeIdentityUrl("https://verify.stripe.com/start/fixture"),
    "https://verify.stripe.com/start/fixture",
  );
  for (const u of [
    "https://verify.stripe.com.evil.test",
    "http://verify.stripe.com",
    "https://evil.test",
    "https://user:password@verify.stripe.com",
  ])
    assert.throws(() => safeIdentityUrl(u));
});
test("identity cleanup verifies the full batch before redacting and never redacts another owner", async () => {
  const calls: string[] = [];
  await assert.rejects(
    redactIdentityAttempts(
      "owner",
      [
        { id: "a", provider_session: "vs_a" },
        { id: "b", provider_session: "vs_b" },
      ],
      {
        retrieve: async (id) => ({
          client_reference_id: id === "vs_b" ? "other" : "owner",
          metadata: { age_attempt_id: id === "vs_a" ? "a" : "b" },
          status: "verified",
          redaction: null,
        }),
        redact: async (id) => {
          calls.push(id);
        },
      },
    ),
  );
  assert.deepEqual(calls, []);
});
test("processing prevents premature deletion; already requested redaction is retry-safe", async () => {
  const calls: string[] = [];
  await assert.rejects(
    redactIdentityAttempts("owner", [{ id: "a", provider_session: "vs_a" }], {
      retrieve: async () => ({
        client_reference_id: "owner",
        metadata: { age_attempt_id: "a" },
        status: "processing",
        redaction: null,
      }),
      redact: async (id) => {
        calls.push(id);
      },
    }),
  );
  await redactIdentityAttempts(
    "owner",
    [{ id: "a", provider_session: "vs_a" }],
    {
      retrieve: async () => ({
        client_reference_id: null,
        metadata: {},
        status: "canceled",
        redaction: { status: "processing" },
      }),
      redact: async (id) => {
        calls.push(id);
      },
    },
  );
  assert.deepEqual(calls, []);
});
