"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { noAccess, type Access } from "@/lib/membership";
import { Shell, Panel } from "./ui";
import FriendPass from "./friend-pass";
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
  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (!data.session) {
      setFactor("");
      setQr("");
      setSetupKey("");
    }
    const r = await supabase.rpc("membership_status");
    setAccess(r.error ? noAccess : r.data);
    return r.error ? noAccess : (r.data as Access);
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get("payment") === "received")
      setNotice(
        "Payment submitted. Access appears after payment verification. Test checkouts never unlock production research.",
      );
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
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
      data.subscription.unsubscribe();
      clearInterval(timer);
    };
  }, []);
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    const credentials = {
      email: String(f.get("email")),
      password: String(f.get("password")),
    };
    try {
      const r = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: location.origin },
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
      const current = await refresh();
      if (
        !signup &&
        (current.allowed || sessionStorage.getItem("vq-join-challenge"))
      )
        router.replace("/");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sign in failed.");
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
  return (
    <Shell active="account">
      <div className="heading">
        <div>
          <div className="eyebrow">VEGAS QUANT ACCOUNT</div>
          <h1>Your next run starts here.</h1>
          <p>Create an account or sign in to join the challenge.</p>
          <button
            type="button"
            className="vq-welcome-about"
            onClick={() => window.dispatchEvent(new Event("vq:welcome"))}
          >
            What is Vegas Quant?
          </button>
        </div>
      </div>
      {notice && (
        <p className="member-notice" role="status">
          {notice}
        </p>
      )}
      {session ? (
        <Panel title="Your account">
          <div className="notebook">
            <p>{session.user.email}</p>
            <p>
              {access.admin_account
                ? access.admin
                  ? "Administrator · Full access"
                  : "Administrator · Complete verification to open your board. No paid pass needed."
                : access.allowed
                  ? "Access active"
                  : "No active research pass"}
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
              Open my challenge →
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
          </form>
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
      {!access.allowed && !access.admin_account && (
        <>
          <div className="pass-grid">
            {quotes.map((q) => (
              <div key={q.plan}>
                <strong>${q.amount / 100}</strong>
                <h2>
                  {q.plan === "full" ? "2026 Season Pass" : "Monthly Access"}
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
              Bowl with no automatic renewal. Both include the same research and
              tracking. Existing passes keep their original expiration dates. No
              number of picks or result is guaranteed; passing is a valid
              decision.
            </p>
            <p>
              Access is personal and includes account-specific watermarks.
              Unauthorized sharing may result in account removal after review.
              We cannot detect or prevent screenshots.
            </p>
            <p>
              You are buying sports analysis and tracking, not a wager or entry
              into a prize pool. No outcome is guaranteed. Refund/support terms
              will be provided before live checkout opens.
            </p>
          </div>
        </Panel>
      )}
    </Shell>
  );
}
