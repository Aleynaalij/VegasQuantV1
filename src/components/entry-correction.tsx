"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { money, odd, time } from "@/lib/domain";
import type { PersonalEntry } from "@/lib/personal";
type RequestRow = {
  id: string;
  reason: string;
  created_at: string;
  proposed: PersonalEntry;
};
type Decision = {
  request_id: string;
  approved: boolean;
  note: string;
  created_at: string;
};
export default function EntryCorrection({
  entry,
  onChanged,
}: {
  entry: PersonalEntry;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="entry-correction">
      <button className="secondary" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "Close correction history" : "Report a mistake / history"}
      </button>
      {expanded && <CorrectionBody entry={entry} onChanged={onChanged} />}
    </div>
  );
}
function CorrectionBody({
  entry,
  onChanged,
}: {
  entry: PersonalEntry;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<RequestRow[]>([]),
    [decisions, setDecisions] = useState<Decision[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const [r, d] = await Promise.all([
        supabase
          .from("personal_correction_requests")
          .select("*")
          .eq("entry_id", entry.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("personal_correction_decisions")
          .select("request_id,approved,note,created_at")
          .eq("entry_id", entry.id),
      ]);
      if (live) {
        if (r.error || d.error) setNotice("Unable to load correction history.");
        else {
          setRequests(r.data);
          setDecisions(d.data);
        }
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [entry.id]);
  const pending = requests.some(
    (r) => !decisions.some((d) => d.request_id === r.id),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    const proposed = {
      line: entry.line === null ? null : Number(f.get("line")),
      odds: Number(f.get("odds")),
      stake_cents: Math.round(Number(f.get("stake")) * 100),
      payout_cents: Math.round(Number(f.get("payout")) * 100),
      book: String(f.get("book")),
      placed_at: new Date(String(f.get("placed_at"))).toISOString(),
    };
    const r = await supabase.rpc("request_entry_correction", {
      p_entry_id: entry.id,
      p_proposed: proposed,
      p_reason: String(f.get("reason")),
    });
    if (r.error) setNotice(r.error.message);
    else {
      setRequests((rs) => [
        {
          id: r.data,
          reason: String(f.get("reason")),
          created_at: new Date().toISOString(),
          proposed: proposed as PersonalEntry,
        },
        ...rs,
      ]);
      setNotice(
        "Sent for admin review. Your current entry remains in effect until approved.",
      );
      onChanged();
    }
    setBusy(false);
  }
  const local = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  const original = entry.original ?? entry;
  return (
    <div>
      <details>
        <summary>Original entry · retained permanently</summary>
        <p>
          {original.book} · line {original.line ?? "Moneyline"} ·{" "}
          {odd(original.odds)} · stake {money(original.stake_cents)} · total
          payout {money(original.payout_cents)}
        </p>
        <small>Recorded {time(original.created_at)}</small>
      </details>
      {requests.map((r) => {
        const d = decisions.find((d) => d.request_id === r.id);
        return (
          <article key={r.id}>
            <b>
              {d
                ? d.approved
                  ? "Approved correction"
                  : "Correction declined"
                : "Awaiting review"}
            </b>
            <small>{time(r.created_at)}</small>
            <p>{r.reason}</p>
            <p>
              Requested: {r.proposed.book} · line{" "}
              {r.proposed.line ?? "Moneyline"} · {odd(r.proposed.odds)} ·{" "}
              {money(r.proposed.stake_cents)} stake ·{" "}
              {money(r.proposed.payout_cents)} total payout
            </p>
            {d && (
              <p>
                Admin: {d.note} · {time(d.created_at)}
              </p>
            )}
          </article>
        );
      })}
      {loading ? (
        <p>Loading history…</p>
      ) : (
        !pending && (
          <form className="member-form" onSubmit={submit}>
            <h3>Correct your recorded terms</h3>
            <p>
              For an entry mistake only. The original published pick stays
              locked. A verified admin reviews every change.
            </p>
            <label>
              Sportsbook
              <input
                name="book"
                defaultValue={entry.book}
                required
                maxLength={100}
              />
            </label>
            {entry.line !== null && (
              <label>
                Actual line
                <input
                  name="line"
                  type="text"
                  inputMode="text"
                  defaultValue={entry.line}
                  pattern="[+\-]?[0-9]+([.][0-9]+)?"
                  required
                />
              </label>
            )}
            <label>
              Actual American odds
              <input
                name="odds"
                type="text"
                inputMode="text"
                defaultValue={entry.odds}
                pattern="[+\-]?[0-9]+([.][0-9]+)?"
                required
              />
            </label>
            <label>
              Stake ($)
              <input
                name="stake"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(entry.stake_cents / 100).toFixed(2)}
                required
              />
            </label>
            <label>
              Total payout including stake ($)
              <input
                name="payout"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(entry.payout_cents / 100).toFixed(2)}
                required
              />
            </label>
            <label>
              Actual placement time (local)
              <input
                name="placed_at"
                type="datetime-local"
                defaultValue={local(entry.placed_at)}
                required
              />
            </label>
            <label>
              What was wrong? Include the corrected details.
              <textarea name="reason" required minLength={3} maxLength={2000} />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Sending…" : "Request correction"}
            </button>
          </form>
        )
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
