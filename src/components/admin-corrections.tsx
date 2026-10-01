"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { money, odd, time } from "@/lib/domain";
import type { PersonalEntry } from "@/lib/personal";
import { Panel } from "./ui";
type RequestRow = {
  id: string;
  email: string;
  selection: string;
  reason: string;
  created_at: string;
  proposed: PersonalEntry;
  current_entry: PersonalEntry;
  official_graded: boolean;
  decision: null | {
    approved: boolean;
    note: string;
    created_at: string;
    result_override: string | null;
  };
};
const terms = (e: PersonalEntry) =>
  `${e.book} · line ${e.line ?? "Moneyline"} · ${odd(e.odds)} · stake ${money(e.stake_cents)} · total return ${money(e.payout_cents)}`;
export default function AdminCorrections() {
  const [rows, setRows] = useState<RequestRow[]>([]),
    [pendingOnly, setPendingOnly] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    const r = await supabase.rpc("admin_entry_corrections", {
      p_pending_only: pendingOnly,
    });
    if (r.error) {
      setRows([]);
      setNotice(r.error.message);
    } else {
      setRows(r.data);
      setNotice("");
    }
    setBusy(false);
  }, [pendingOnly]);
  useEffect(() => {
    void load();
  }, [load]);
  async function review(e: FormEvent<HTMLFormElement>, r: RequestRow) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const approved = f.get("decision") === "approve";
    const res = await supabase.rpc("review_entry_correction", {
      p_request_id: r.id,
      p_approve: approved,
      p_note: String(f.get("note")),
      p_result:
        approved && r.official_graded ? String(f.get("result")) || null : null,
    });
    if (res.error) {
      setNotice(res.error.message);
      setBusy(false);
    } else await load();
  }
  return (
    <Panel title="Entry corrections">
      <div className="update-feed">
        <div className="personal-toolbar">
          <label>
            Show
            <select
              value={pendingOnly ? "pending" : "all"}
              onChange={(e) => setPendingOnly(e.target.value === "pending")}
            >
              <option value="pending">Awaiting review</option>
              <option value="all">Recent history</option>
            </select>
          </label>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh corrections
          </button>
        </div>
        <p className="personal-caption">
          Latest 100 requests. Original entries and all decisions remain on
          record.
        </p>
        {notice && <p role="alert">{notice}</p>}
        {!busy && !rows.length && <p>No correction requests.</p>}
        {rows.map((r) => (
          <article className="correction-review" key={r.id}>
            <h3>{r.email}</h3>
            <p>{r.selection}</p>
            <small>Requested {time(r.created_at)}</small>
            <p>
              <b>Current:</b> {terms(r.current_entry)}
            </p>
            <p>
              <b>Requested:</b> {terms(r.proposed)}
            </p>
            <p>
              Placement: {time(r.current_entry.placed_at)} →{" "}
              {time(r.proposed.placed_at)}
            </p>
            <p>
              <b>Reason:</b> {r.reason}
            </p>
            {r.decision ? (
              <p>
                {r.decision.approved ? "Approved" : "Declined"} ·{" "}
                {r.decision.note} · {time(r.decision.created_at)}
                {r.decision.result_override &&
                  ` · Corrected result: ${r.decision.result_override}`}
              </p>
            ) : (
              <form className="member-form" onSubmit={(e) => void review(e, r)}>
                <label>
                  Decision
                  <select name="decision" required defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    <option value="approve">Approve corrected terms</option>
                    <option value="reject">Decline request</option>
                  </select>
                </label>
                {r.official_graded && (
                  <label>
                    Result under corrected terms (required to approve)
                    <select name="result" defaultValue="">
                      <option value="">Select verified result</option>
                      {["WIN", "LOSS", "PUSH", "VOID"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Review explanation / verification source
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <label className="entry-confirm">
                  <input type="checkbox" required /> I checked the requested
                  change. This decision is permanent.
                </label>
                <button className="primary" disabled={busy}>
                  Save review
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}
