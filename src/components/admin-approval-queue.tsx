"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
type Applicant = {
  user_id: string;
  email: string | null;
  username: string | null;
  requested_at: string;
  email_confirmed: boolean;
  ready: boolean;
};
type Queue = { pending: number; applications: Applicant[] };
export default function AdminApprovalQueue() {
  const [data, setData] = useState<Queue | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null),
    [page, setPage] = useState(0);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const r = await supabase.rpc("admin_beta_applications", { p_page: page });
      if (current !== generation.current) return;
      if (r.error) {
        setData(null);
        setError(
          "Approval queue unavailable. Complete two-step verification and retry.",
        );
        return;
      }
      setData(r.data as Queue);
      setError("");
    } catch {
      if (current === generation.current) {
        setData(null);
        setError("Approval queue unavailable. Retry in a moment.");
      }
    }
  }, [page]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    const auth = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setData(null);
      setTimeout(() => void load(), 0);
    });
    return () => {
      generation.current++;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [load]);
  async function review(a: Applicant, decision: "approved" | "declined") {
    if (busy) return;
    setBusy(a.user_id);
    setNotice("");
    try {
      const r = await supabase.rpc("review_beta_application", {
        p_user: a.user_id,
        p_decision: decision,
      });
      if (r.error) {
        setNotice(
          "Decision wasn’t saved. The application may have changed or verification may be required. Refresh and retry.",
        );
        return;
      }
      setNotice(
        `${a.username ? "@" + a.username : a.email || "Account"} ${decision === "approved" ? "approved" : "declined"}.`,
      );
      await load();
    } catch {
      setNotice("Decision wasn’t saved. Check your connection and retry.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="admin-members"
      aria-label="Account approval queue"
      id="account-approvals"
    >
      <header>
        <span className="eyebrow">PRIVATE BETA · ADMIN ONLY</span>
        <h2>Account approval queue{data ? ` · ${data.pending}` : ""}</h2>
        <p>
          New accounts finish setup, then wait here for your approval. Existing
          members retain access.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        className="secondary"
        disabled={!!busy}
        onClick={() => void load()}
      >
        Refresh queue
      </button>
      {data?.pending === 0 && <p>No applications waiting for review.</p>}
      <ul className="admin-members-list">
        {data?.applications.map((a) => (
          <li key={a.user_id}>
            <div className="admin-member-head">
              <span>
                <b>{a.username ? `@${a.username}` : "Profile not finished"}</b>
                <small>{a.email}</small>
              </span>
              <em>{a.ready ? "Ready for review" : "Setup incomplete"}</em>
            </div>
            <p>
              Applied{" "}
              {new Date(a.requested_at).toLocaleString("en-US", {
                timeZone: "America/New_York",
              })}{" "}
              ET · {a.email_confirmed ? "Email confirmed" : "Email unconfirmed"}
            </p>
            {!a.ready && (
              <p>
                Applicant must finish profile and any required age check before
                approval.
              </p>
            )}
            <div className="beta-review-actions">
              <button
                type="button"
                className="primary"
                disabled={!!busy || !a.ready}
                onClick={() => void review(a, "approved")}
              >
                {busy === a.user_id ? "Saving…" : "Approve access"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => void review(a, "declined")}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {data && (page > 0 || data.pending > (page + 1) * 50) && (
        <div className="admin-members-pages">
          <button
            type="button"
            disabled={page === 0 || !!busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            disabled={data.pending <= (page + 1) * 50 || !!busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
