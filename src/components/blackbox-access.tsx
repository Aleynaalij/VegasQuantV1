"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState, type FormEvent } from "react";
import { prepareAdminTotp } from "@/lib/admin-totp";
import { supabase } from "@/lib/supabase";
import { BlackboxControlCenter } from "./blackbox-control-center";
import { Panel } from "./ui";

function BlackboxAuthenticator({ session }: { session: Session }) {
  const [enrollment, setEnrollment] =
    useState<Awaited<ReturnType<typeof prepareAdminTotp>>>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function prepare() {
    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("membership_status");
      if (error) throw error;
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== session.user.id)
        throw new Error("Your sign-in changed. Sign in again.");
      setEnrollment(await prepareAdminTotp(data?.admin_account === true));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Authenticator setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment || busy) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setBusy(true);
    setNotice("");
    try {
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== session.user.id)
        throw new Error("Your sign-in changed. Sign in again.");
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.id,
        code,
      });
      if (error) throw error;
      setEnrollment(undefined);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Blackbox staging · Two-step verification">
      <p>{session.user.email}</p>
      {!enrollment && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void prepare()}
        >
          Continue with authenticator
        </button>
      )}
      {enrollment?.setupKey && (
        <label>
          Add a time-based account named Blackbox staging in your authenticator.
          <input
            value={enrollment.setupKey}
            readOnly
            aria-label="Authenticator setup key"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      {enrollment && (
        <form className="member-form" onSubmit={verify}>
          <label>
            Authenticator code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            Verify authenticator
          </button>
        </form>
      )}
      <p role="status">{notice}</p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void supabase.auth.signOut()}
      >
        Sign out
      </button>
    </Panel>
  );
}

export function BlackboxAccess() {
  const [session, setSession] = useState<Session | null>();
  const [assuredToken, setAssuredToken] = useState<string>();
  const [failedToken, setFailedToken] = useState<string>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const token = session?.access_token;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel(token).then(
      ({ data, error }) => {
        if (!active) return;
        setAssuredToken(data?.currentLevel === "aal2" ? token : undefined);
        setFailedToken(error ? token : undefined);
      },
      () => {
        if (active) setFailedToken(token);
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (error) throw error;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined)
    return <p role="status">Checking staging sign-in…</p>;
  if (session && token === assuredToken)
    return <BlackboxControlCenter key={session.user.id} />;
  if (session && token === failedToken)
    return (
      <Panel title="Blackbox staging">
        <p>Unable to verify this session. Sign in again.</p>
        <button
          className="secondary"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      </Panel>
    );
  if (session)
    return <BlackboxAuthenticator key={session.user.id} session={session} />;

  return (
    <Panel title="Sign in to Blackbox staging">
      <form className="member-form" onSubmit={signIn}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          Sign in
        </button>
      </form>
      <p role="status">{notice}</p>
    </Panel>
  );
}
