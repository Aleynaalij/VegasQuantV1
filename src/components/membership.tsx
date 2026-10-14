"use client";
import FollowTopics from "./follow-topics";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { noAccess, type Access } from "@/lib/membership";
import { Shell, Panel } from "./ui";
import FriendPass from "./friend-pass";
import CommunitySettings from "./community-settings";
import PickAlerts from "./pick-alerts";
import AccountDeletion from "./account-deletion";
import AgeVerificationPanel from "./age-verification-panel";
import type { AgeStatus } from "@/lib/age-verification";
import BillingAccount from "./billing-account";
import type { Session } from "@supabase/supabase-js";
type Quote = {
  plan: "full" | "monthly";
  amount: number;
  recurring: boolean;
  expires_at: string | null;
};
export default function Membership() {
  const router = useRouter();
  const [age, setAge] = useState<AgeStatus | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [access, setAccess] = useState<Access>(noAccess),
    [signup, setSignup] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [enabled, setEnabled] = useState(false),
    [mode, setMode] = useState("test"),
    [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [setupKey, setSetupKey] = useState("");
  const refreshGeneration = useRef(0),
    accountId = useRef<string | null>(null);
  async function refresh() {
    const current = ++refreshGeneration.current;
    const { data } = await supabase.auth.getSession();
    if (current !== refreshGeneration.current) return noAccess;
    if (accountId.current !== (data.session?.user.id || null)) {
      accountId.current = data.session?.user.id || null;
      setAge(null);
      setAccess(noAccess);
    }
    setSession(data.session);
    if (!data.session) {
      setFactor("");
      setQr("");
      setSetupKey("");
    }
    if (data.session) {
      const ageResult = await supabase.rpc("age_verification_status");
      if (current !== refreshGeneration.current) return noAccess;
      setAge(ageResult.error ? null : ageResult.data);
    } else setAge(null);
    const r = await supabase.rpc("membership_status");
    if (current !== refreshGeneration.current) return noAccess;
    setAccess(r.error ? noAccess : r.data);
    return r.error ? noAccess : (r.data as Access);
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get("account") === "deleted")
      setNotice(
        "Your account and personal app data have been deleted. Linked membership renewals were stopped. Published research remains.",
      );
    if (new URLSearchParams(location.search).get("payment") === "received")
      setNotice(
        "Payment submitted. Access appears after payment verification. Test checkouts never unlock production research.",
      );
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      refreshGeneration.current++;
      if (accountId.current !== (next?.user.id || null)) {
        setAge(null);
        setAccess(noAccess);
      }
      setTimeout(() => void refresh(), 0);
    });
    fetch("/api/billing/quote")
      .then((r) => r.json())
      .then((r) => {
        setQuotes(r.quotes || []);
        setEnabled(r.enabled);
        setMode(r.mode);
      })
      .catch(() => setNotice("Membership pricing is temporarily unavailable."));
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      refreshGeneration.current++;
      data.subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    if (signup && f.get("legal_consent") !== "on") {
      setNotice(
        "Confirm that you are 21 or older and accept the Terms of Use before registering.",
      );
      setBusy(false);
      return;
    }
    const credentials = {
      email: String(f.get("email")),
      password: String(f.get("password")),
    };
    try {
      const r = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: location.origin,
              data: {
                vq_terms_version: "2026-10-14",
                vq_terms_accepted_at: new Date().toISOString(),
                vq_age_21_self_attested: true,
              },
            },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (r.error) throw r.error;
      if (signup) window.dispatchEvent(new Event("vq:welcome"));
      const friendsCode = String(f.get("friends_code") || "").trim();
      if (signup && friendsCode) {
        try {
          sessionStorage.setItem("vq-friend-code", friendsCode);
        } catch {}
      }
      setNotice(
        signup
          ? "Confirm your email, then return here to sign in. If you entered a friends code, activate it below after signing in."
          : "Signed in.",
      );
      await refresh();
      if (!signup) {
        const gate = await supabase.rpc("age_verification_status");
        router.replace(
          gate.error || (gate.data.required && !gate.data.verified)
            ? "/account/verify-age"
            : "/",
        );
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function recover(form: HTMLFormElement) {
    const email = String(new FormData(form).get("email") || "").trim();
    if (
      !email ||
      !form
        .querySelector<HTMLInputElement>('input[name="email"]')
        ?.checkValidity()
    ) {
      setNotice("Enter your account email first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/account/recovery`,
      });
      if (error) throw error;
      setNotice(
        "If an account exists for this email, a reset link will arrive. Check spam and use the newest link. Allow a few minutes before requesting another.",
      );
    } catch {
      setNotice(
        "Couldn’t send a reset link. Please wait a few minutes and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function checkout(plan: "full" | "monthly") {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in first.");
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Checkout unavailable.");
      location.assign(body.url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  }
  async function prepareMfa() {
    setBusy(true);
    try {
      const r = await supabase.auth.mfa.listFactors();
      if (r.error) throw r.error;
      const existing = r.data.totp.find((f) => f.status === "verified");
      if (existing) {
        setFactor(existing.id);
        setQr("");
        setSetupKey("");
      } else {
        if (factor && setupKey) return;
        // Unverified enrollments cannot be recovered after leaving this page.
        // Remove only incomplete setup attempts; never remove a verified factor.
        for (const pending of r.data.all.filter(
          (f) => f.factor_type === "totp" && f.status === "unverified",
        )) {
          const removed = await supabase.auth.mfa.unenroll({
            factorId: pending.id,
          });
          if (removed.error) throw removed.error;
        }
        const enrolled = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Vegas Quant admin ${Date.now()}`,
        });
        if (enrolled.error) throw enrolled.error;
        setFactor(enrolled.data.id);
        setQr(enrolled.data.totp.qr_code);
        setSetupKey(enrolled.data.totp.secret);
      }
      setNotice("Use your authenticator app to provide the six-digit code.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "MFA setup failed");
    } finally {
      setBusy(false);
    }
  }
  async function verifyMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const code = String(new FormData(e.currentTarget).get("code"));
      const r = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (r.error) throw r.error;
      setQr("");
      setFactor("");
      setSetupKey("");
      const current = await refresh();
      if (current.admin) router.replace("/");
      else setNotice("Verification completed. Refresh to check your access.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }
  if (session && (!age || (age.required && !age.verified)))
    return (
      <Shell active="account">
        <div className="page-heading">
          <span className="eyebrow">ACCOUNT SECURITY</span>
          <h1>Verify your age to continue</h1>
        </div>
        <AgeVerificationPanel key={session.user.id} uid={session.user.id} />
        <Panel title="Account controls">
          <p>{session.user.email}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        </Panel>
        <BillingAccount token={session.access_token} />
        <AccountDeletion uid={session.user.id} />
      </Shell>
    );
  return (
    <Shell active="account">
      <div className="heading">
        <div>
          <div className="eyebrow">VEGAS QUANT ACCOUNT</div>
          <h1>{session ? "Your account." : "Join the desk."}</h1>
          <p>
            {session
              ? "Your profile, research access and notification preferences."
              : "Create your profile. Explore the research. Follow at your pace."}
          </p>
          <button
            type="button"
            className="vq-welcome-about"
            onClick={() => window.dispatchEvent(new Event("vq:welcome"))}
          >
            What is Vegas Quant?
          </button>
        </div>
      </div>
      {session && (
        <nav className="account-wayfinding" aria-label="Account sections">
          <Link href="#community-settings">
            Profile<small>Identity & visibility</small>
          </Link>
          <Link href="#access-settings">
            Access<small>Trial & membership</small>
          </Link>
          <Link href="#notification-settings">
            Alerts<small>Update preferences</small>
          </Link>
        </nav>
      )}
      {notice && (
        <p className="member-notice" role="status">
          {notice}
        </p>
      )}
      {session ? (
        <Panel
          id="access-settings"
          title="Your account"
          className="access-settings"
        >
          <div className="notebook">
            <p>{session.user.email}</p>
            <p>
              {access.admin_account
                ? access.admin
                  ? "Administrator · Full access"
                  : "Administrator · Complete verification to open your board. No paid pass needed."
                : access.allowed
                  ? access.trial_active
                    ? "Premium research active · 14-day signup trial included"
                    : "Premium research active"
                  : "Free Community · Challenge, published picks and basic tracking included"}
              {access.expires_at
                ? ` · Expires ${new Date(access.expires_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
                : ""}
            </p>
            {access.admin && (
              <nav className="account-tools">
                <Link href="/admin">Publishing desk →</Link>
                <Link href="/admin/accounts">Accounts & tail activity →</Link>
                <Link href="/admin/intelligence">
                  Private Data Intelligence →
                </Link>
              </nav>
            )}
            <Link className="primary" href="/">
              Open the sports desk →
            </Link>{" "}
            <button
              className="research-more"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </Panel>
      ) : (
        <Panel title={signup ? "Create your account" : "Sign in"}>
          <form className="member-form" onSubmit={auth}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </label>
            {signup && (
              <label>
                Friends promo code (optional)
                <input
                  name="friends_code"
                  maxLength={100}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <small>
                  Confirm your email, then activate your code after signing in.
                  A place is used only after successful redemption.
                </small>
              </label>
            )}
            {signup ? (
              <label className="vq-legal-consent">
                <input type="checkbox" name="legal_consent" required />
                <span>
                  I am 21 or older and agree to the{" "}
                  <Link href="/terms" target="_blank">
                    Terms of Use
                  </Link>
                  . I have read the{" "}
                  <Link href="/privacy" target="_blank">
                    Privacy Notice
                  </Link>{" "}
                  and understand that selections can lose. This is a
                  self-declaration. Independent ID-and-selfie age verification
                  is being introduced for new and existing accounts; this
                  checkbox does not complete it.
                </span>
              </label>
            ) : null}
            <button className="primary" disabled={busy}>
              {signup ? "Register" : "Sign in"}
            </button>
            <button
              type="button"
              className="research-more"
              onClick={() => setSignup(!signup)}
            >
              {signup
                ? "Already registered? Sign in"
                : "New here? Create an account"}
            </button>
            {!signup && (
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  if (form) void recover(form);
                }}
              >
                Forgot password?
              </button>
            )}
          </form>
        </Panel>
      )}
      {session && (
        <AgeVerificationPanel key={session.user.id} uid={session.user.id} />
      )}
      {session && (
        <Panel title="Settings · Community profile">
          <CommunitySettings key={session.user.id} uid={session.user.id} />
        </Panel>
      )}
      {session && (
        <Panel
          id="notification-settings"
          title="App notifications"
          className="notification-settings"
        >
          <PickAlerts />
          <FollowTopics />
          <Link className="text-link" href="/saved">
            Your saved legs →
          </Link>
          <button
            className="text-link"
            onClick={() => window.dispatchEvent(new Event("vq:phone-settings"))}
          >
            Mobile number &amp; future text alerts →
          </button>
        </Panel>
      )}
      {session && !access.admin_account && <FriendPass />}
      {access.admin_account && !access.admin && (
        <Panel title="Admin security · Two-step verification">
          <div className="notebook">
            <p>
              Your admin account is recognized. Two-step verification protects
              your research and publishing tools. Complete it below to open the
              board.
            </p>
            {!factor && (
              <button className="primary" disabled={busy} onClick={prepareMfa}>
                Continue with authenticator
              </button>
            )}
            {setupKey && (
              <div className="mfa-setup">
                <h3>Setting up on this phone?</h3>
                <p>
                  Copy the setup key. In your authenticator app, add an account
                  using a setup key (manual entry), choose Time-based, and name
                  it Vegas Quant. Return here and enter its six-digit code.
                </p>
                <label>
                  Setup key
                  <input
                    aria-label="Authenticator setup key"
                    readOnly
                    value={setupKey}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  className="primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(setupKey);
                      setNotice(
                        "Setup key copied. Add it in your authenticator app, then return here.",
                      );
                    } catch {
                      setNotice(
                        "Press and hold the setup key to copy it manually.",
                      );
                    }
                  }}
                >
                  Copy setup key
                </button>
                <p className="muted">
                  Keep this key private. It is shown only during setup.
                </p>
              </div>
            )}
            {qr && (
              <details className="mfa-alternative">
                <summary>Using another device? Show QR code</summary>
                <img
                  className="mfa-qr"
                  src={qr}
                  alt="Scan with your authenticator app"
                />
              </details>
            )}
            {factor && (
              <form className="member-form" onSubmit={verifyMfa}>
                <label>
                  Authenticator code
                  <input
                    name="code"
                    aria-label="Authenticator code"
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Verify & open board
                </button>
              </form>
            )}
          </div>
        </Panel>
      )}
      {access.admin && (
        <p>
          <Link className="text-link" href="/admin">
            Open private publishing desk →
          </Link>
          {" · "}
          <Link className="text-link" href="/admin/accounts">
            Accounts & friends passes →
          </Link>
        </p>
      )}
      {session && <BillingAccount token={session.access_token} />}
      {session && (
        <AccountDeletion key={session.user.id} uid={session.user.id} />
      )}
      <Panel title="Free to follow. Premium to go deeper.">
        <div className="notebook">
          <h3>14 days of Premium, on us</h3>
          <p>
            Every new account gets a free Premium trial for 14 days from signup.
            No card required and no automatic charge. After the trial, keep
            using Free Community or choose a paid Premium plan.
          </p>
          <h3>Free Community</h3>
          <p>
            The 5-Spot Challenge, official published picks and edge cards,
            decision alerts, Community profiles, share cards, basic personal
            bankroll tracking and the public official record—including losses
            and passes.
          </p>
          <h3>Premium research · $5/month or $20 for the 2026 season</h3>
          <p>
            Full every-game matchup analysis, potential target boards, injury
            and weather research, market history, timestamped analysis versions,
            and detailed official process reviews and exports.
          </p>
          <p>
            No daily pick is promised. If no qualifying edge exists, the
            decision is WAIT/PASS. Admin intelligence and other members’
            financial details remain private.
          </p>
        </div>
      </Panel>
      {!access.allowed && !access.admin_account && (
        <>
          <div className="pass-grid">
            {quotes.map((q) => (
              <div key={q.plan}>
                <strong>${q.amount / 100}</strong>
                <h2>
                  {q.plan === "full"
                    ? "2026 Premium Season Pass"
                    : "Monthly Premium Research"}
                </h2>
                <p>
                  {q.recurring
                    ? "Per month · renews automatically until canceled."
                    : "One payment · includes playoffs and the Super Bowl."}
                </p>
                <p>
                  {q.expires_at
                    ? `Access through ${new Date(q.expires_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })}.`
                    : "Cancel in Account. Access continues through your paid billing period."}
                </p>
                <button
                  className="primary"
                  disabled={!session || busy || !enabled}
                  onClick={() => checkout(q.plan)}
                >
                  {!enabled
                    ? "Checkout coming soon"
                    : !session
                      ? "Sign in to continue"
                      : mode === "test"
                        ? "Try test checkout"
                        : "Continue to secure checkout"}
                </button>
              </div>
            ))}
          </div>
          <p className="muted">
            {enabled && mode === "test"
              ? "Test mode only. No real payments. Test purchases do not grant production access."
              : enabled
                ? "Payments are processed securely by Stripe."
                : "Checkout will open once payment setup is complete."}
          </p>
        </>
      )}
      {!access.admin_account && (
        <Panel title="How season access works">
          <div className="notebook">
            <p>
              Monthly access is $5 per month and renews until canceled. The $20
              Season Pass covers the remaining 2026 season, playoffs, and Super
              Bowl with no automatic renewal. Both include the same Premium
              research. Community, published picks and basic tracking are free.
              Existing passes keep their original expiration dates. No number of
              picks or result is guaranteed; passing is a valid decision.
            </p>
            <p>
              Access is personal and includes account-specific watermarks.
              Unauthorized sharing may result in account removal after review.
              We cannot detect or prevent screenshots.
            </p>
            <p>
              You are buying sports analysis and tracking, not a wager or entry
              into a prize pool. No outcome is guaranteed. Billing questions and
              refund requests should be directed to the platform administrator.
              Cancellation stops future monthly renewals; it is separate from a
              refund request.
            </p>
          </div>
        </Panel>
      )}
    </Shell>
  );
}
