"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { noAccess, type Access } from "@/lib/membership";
import { Shell, Panel } from "./ui";
import type { Session } from "@supabase/supabase-js";
type Quote = {
  plan: "full" | "half";
  amount: number;
  covered: number;
  remaining: number;
  expires_at: string;
};
export default function Membership() {
  const [session, setSession] = useState<Session | null>(null),
    [access, setAccess] = useState<Access>(noAccess),
    [signup, setSignup] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [quotes, setQuotes] = useState<Quote[]>([]),
    [enabled, setEnabled] = useState(false),
    [mode, setMode] = useState("test"),
    [factor, setFactor] = useState(""),
    [qr, setQr] = useState("");
  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    const r = await supabase.rpc("membership_status");
    setAccess(r.error ? noAccess : r.data);
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
      setNotice(
        signup
          ? "Confirm your email, then return here to sign in. Registration alone does not unlock paid research."
          : "Signed in.",
      );
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function checkout(plan: "full" | "half") {
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
      } else {
        const enrolled = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Vegas Quant admin ${Date.now()}`,
        });
        if (enrolled.error) throw enrolled.error;
        setFactor(enrolled.data.id);
        setQr(enrolled.data.totp.qr_code);
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
      await refresh();
      setNotice("Admin verification complete.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className="heading">
        <div>
          <div className="eyebrow">VEGAS QUANT MEMBERSHIP</div>
          <h1>Your seat at the research desk.</h1>
          <p>2026 season passes · One payment · No automatic renewal</p>
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
              {access.allowed ? "Access active" : "No active research pass"}
              {access.expires_at
                ? ` · Expires ${new Date(access.expires_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET`
                : ""}
            </p>
            {access.allowed && (
              <Link className="primary" href="/">
                Open research desk →
              </Link>
            )}{" "}
            <button
              className="research-more"
              onClick={() => void supabase.auth.signOut()}
            >
              Sign out
            </button>
          </div>
        </Panel>
      ) : (
        <Panel title={signup ? "Create your account" : "Member sign in"}>
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
      {access.admin_account && !access.admin && (
        <Panel title="Admin security · Two-step verification">
          <div className="notebook">
            <p>
              Admin publishing requires an authenticator code after sign-in.
            </p>
            <button className="primary" disabled={busy} onClick={prepareMfa}>
              Set up / verify authenticator
            </button>
            {qr && (
              <img
                className="mfa-qr"
                src={qr}
                alt="Scan with your authenticator app"
              />
            )}
            {factor && (
              <form className="member-form" onSubmit={verifyMfa}>
                <label>
                  Authenticator code
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Verify
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
        </p>
      )}
      {!access.allowed && !access.admin_account && (
        <>
          <div className="pass-grid">
            {quotes.map((q) => (
              <div key={q.plan}>
                <strong>${q.amount / 100}</strong>
                <h2>
                  {q.plan === "full" ? "Full season" : "Half of what remains"}
                </h2>
                <p>
                  {q.covered} of {q.remaining} remaining weeks/playoff rounds.
                </p>
                <p>
                  Access through{" "}
                  {new Date(q.expires_at).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                  })}{" "}
                  ET.
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
              : "Checkout will open once payment setup is complete."}
          </p>
        </>
      )}
      <Panel title="How season access works">
        <div className="notebook">
          <p>
            Full access covers the remaining 2026 season, playoffs, and Super
            Bowl. Half access covers the next half of remaining NFL weeks and
            playoff rounds, rounded up. The current unfinished round counts. A
            pass begins after payment confirmation and ends at the exact date
            shown before checkout. No guaranteed number of picks; a pass remains
            a valid decision.
          </p>
          <p>
            Access is personal and includes account-specific watermarks.
            Unauthorized sharing may result in account removal after review. We
            cannot detect or prevent screenshots. No automatic renewal.
          </p>
          <p>
            You are buying sports analysis and tracking, not a wager or entry
            into a prize pool. No outcome is guaranteed. Refund/support terms
            will be provided before live checkout opens.
          </p>
        </div>
      </Panel>
    </Shell>
  );
}
