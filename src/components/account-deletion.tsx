"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
export default function AccountDeletion({ uid }: { uid: string }) {
  const [confirm, setConfirm] = useState(""),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (confirm !== "DELETE" || !password || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const session = await supabase.auth.getSession();
      if (session.data.session?.user.id !== uid)
        throw Error("Sign in again before deleting.");
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({ confirmation: confirm, password }),
      });
      const data = await r.json();
      setPassword("");
      if (!r.ok || data.deleted !== true)
        throw Error(
          data.error ||
            "Deletion did not finish. Your account has not been deleted.",
        );
      // Remove this member's local preferences and browser session after confirmed
      // server erasure. A full navigation clears stale in-memory account data.
      try {
        for (const storage of [localStorage, sessionStorage])
          for (const key of Object.keys(storage))
            if (key.startsWith("vq-") && key.includes(uid))
              storage.removeItem(key);
      } catch {}
      if ("serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const push = await registration?.pushManager.getSubscription();
          await push?.unsubscribe();
        } catch {}
      }
      await supabase.auth.signOut({ scope: "local" });
      location.assign("/membership?account=deleted");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Deletion did not finish. Try again.",
      );
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <Panel title="Privacy · Delete account">
      <div className="notebook">
        <p>
          Permanently remove your login, profile and photo, posts, comments,
          follows, saved selections, phone contact, notification subscriptions,
          personal tracking and in-app membership records.
        </p>
        <p>
          Deletion ends paid access and cancels linked recurring memberships
          immediately. It does not issue a refund or delete receipts held by
          Stripe. Published Vegas Quant research and official results remain. If
          you used age verification, deletion requests Stripe Identity redaction
          first; completion may take up to four days. A processing verification
          must finish before deletion can continue. Provider security logs and
          backups follow their own retention policies.
        </p>
        {!open ? (
          <button className="secondary" onClick={() => setOpen(true)}>
            Delete my account…
          </button>
        ) : (
          <form onSubmit={submit} className="member-form">
            <p>
              <strong>This cannot be undone.</strong> Save any personal records
              or receipts you need before continuing.
            </p>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <label>
              Type DELETE to confirm
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                required
                pattern="DELETE"
                disabled={busy}
              />
            </label>
            <button
              className="primary"
              disabled={busy || confirm !== "DELETE" || !password}
            >
              {busy
                ? "Deleting account…"
                : "Permanently delete account & cancel membership"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setPassword("");
                setConfirm("");
              }}
            >
              Keep my account
            </button>
          </form>
        )}
        <p role="status">{notice}</p>
        <Link href="/privacy">Privacy notice</Link> ·{" "}
        <Link href="/support">Help & support</Link>
      </div>
    </Panel>
  );
}
