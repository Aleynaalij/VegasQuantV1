"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Panel, Shell } from "./ui";
export default function PasswordRecovery() {
  const [ready, setReady] = useState(false),
    [notice, setNotice] = useState(
      "Open the password-reset link from your email.",
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const listener = supabase.auth.onAuthStateChange((event) => {
      if (live && event === "PASSWORD_RECOVERY") {
        setReady(true);
        setNotice("Choose a new password.");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (live && data.session) {
        setReady(true);
        setNotice("Choose a new password.");
      }
    });
    return () => {
      live = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirm")) {
      setNotice("Passwords do not match.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await supabase.auth.signOut();
    setReady(false);
    setNotice("Password updated. Sign in with your new password.");
  }
  return (
    <Shell active="account">
      <Panel title="Reset your password">
        <div className="notebook">
          <p role="status">{notice}</p>
          {ready && (
            <form className="member-form" onSubmit={submit}>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <button disabled={busy} className="primary">
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
          <Link href="/membership">Return to sign in →</Link>
        </div>
      </Panel>
    </Shell>
  );
}
