import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  authErrorMessage,
  retryAfterSeconds,
  signupAlreadyRegistered,
} from "../src/lib/auth-messages";

test("rate-limit errors become a plain wait message with the server's seconds", () => {
  const e = {
    code: "over_email_send_rate_limit",
    message:
      "For security purposes, you can only request this after 53 seconds.",
  };
  assert.equal(retryAfterSeconds(e), 53);
  const m = authErrorMessage(e);
  assert.match(m, /wait 53 seconds/);
  assert.match(m, /newest email/);
  assert.doesNotMatch(m, /For security purposes/);
});

test("unconfirmed sign-in points to the newest email and the resend button", () => {
  assert.match(
    authErrorMessage({
      code: "email_not_confirmed",
      message: "Email not confirmed",
    }),
    /resend it below/,
  );
});

test("unknown errors keep the server message, else the fallback", () => {
  assert.equal(authErrorMessage({ code: "x", message: "Boom" }), "Boom");
  assert.equal(
    authErrorMessage(null, "Registration failed."),
    "Registration failed.",
  );
  assert.equal(retryAfterSeconds({ message: "nope" }), null);
});

test("a sign-up for an already-confirmed address is detected (no identities)", () => {
  assert.equal(signupAlreadyRegistered({ identities: [] }), true);
  assert.equal(signupAlreadyRegistered({ identities: [{}] }), false);
  assert.equal(signupAlreadyRegistered({}), false);
  assert.equal(signupAlreadyRegistered(null), false);
});

test("membership form guards double submits and offers a cooldown resend of the signup email", () => {
  const src = readFileSync("src/components/membership.tsx", "utf8");
  assert.match(src, /if \(submitting\.current\) return;/);
  assert.match(
    src,
    /supabase\.auth\.resend\(\{\s*type: "signup",\s*email: pendingEmail,\s*options: \{ emailRedirectTo: location\.origin \}/,
  );
  assert.match(src, /disabled=\{busy \|\| resendWait > 0\}/);
  assert.doesNotMatch(
    src,
    /e instanceof Error \? e\.message : "Sign in failed\."/,
  );
});
