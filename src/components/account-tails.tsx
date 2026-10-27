"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { money, odd, signedMoney, time } from "@/lib/domain";
import type { PersonalEntry } from "@/lib/personal";
type Tail = PersonalEntry & {
  selection: string;
  challenge_number: number;
  result: string | null;
  profit_cents: number | null;
  needs_review: boolean;
};
export default function AccountTails({
  userId,
  count,
  openCount,
}: {
  userId: string;
  count: number;
  openCount: number;
}) {
  const [tails, setTails] = useState<Tail[] | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    const r = await supabase.rpc("admin_tail_entries", { p_user_id: userId });
    if (r.error) {
      setTails(null);
      setNotice("Verified admin access required.");
    } else {
      setTails(r.data);
      setNotice("");
    }
    setBusy(false);
  }
  async function grade(e: FormEvent<HTMLFormElement>, entryId: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const r = await supabase.rpc("grade_personal_entry", {
      p_entry_id: entryId,
      p_result: String(f.get("result")),
      p_source: String(f.get("source")),
    });
    if (r.error) {
      setNotice(r.error.message);
      setBusy(false);
    } else await load();
  }
  return (
    <div>
      <p>
        <b>
          {count} recorded {count === 1 ? "tail" : "tails"}
        </b>{" "}
        · {openCount} unsettled
      </p>
      {count > 0 && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => (tails ? setTails(null) : void load())}
        >
          {tails ? "Hide entries" : "View tailing activity"}
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {tails && (
        <div className="personal-history">
          <p>Most recent 50 entries · self-reported by this account</p>
          {tails.map((t) => (
            <article key={t.id}>
              <strong>{t.selection}</strong>
              <p>
                Challenge #{t.challenge_number} · {t.book} · actual line{" "}
                {t.line ?? "Moneyline"} · {odd(t.odds)}
              </p>
              <p>
                Stake {money(t.stake_cents)} · payout if win{" "}
                {money(t.payout_cents)} ·{" "}
                {t.result ??
                  (t.needs_review ? "Needs individual grade" : "IN PLAY")}
                {t.profit_cents !== null &&
                  ` · ${signedMoney(t.profit_cents)} P/L`}
              </p>
              <small>
                Placed {time(t.placed_at)} · Recorded {time(t.created_at)}
              </small>
              {t.needs_review && (
                <form
                  className="member-form"
                  onSubmit={(e) => void grade(e, t.id)}
                >
                  <p>
                    This actual line differs from the graded official entry.
                    Check its result separately.
                  </p>
                  <label>
                    Individual result
                    <select name="result" required defaultValue="">
                      <option value="" disabled>
                        Select result
                      </option>
                      {["WIN", "LOSS", "PUSH", "VOID"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Grading source / explanation
                    <input name="source" required maxLength={1000} />
                  </label>
                  <label className="entry-confirm">
                    <input type="checkbox" required /> I verified this entry’s
                    result. Settlement is permanent.
                  </label>
                  <button className="primary" disabled={busy}>
                    Save individual result
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
