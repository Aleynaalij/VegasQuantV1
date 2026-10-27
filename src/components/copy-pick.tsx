"use client";

import { useRef, useState, type FormEvent } from "react";
import { money, odd, winProfit } from "@/lib/domain";
import { supabase } from "@/lib/supabase";

type Track = {
  pickId: string;
  challengeId: string;
  line: number | null;
  kickoff: string;
};
export default function CopyPick({
  selection,
  odds,
  stakeCents,
  track,
}: {
  selection: string;
  odds: number;
  stakeCents: number;
  track?: Track;
}) {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actualOdds, setActualOdds] = useState(String(odds));
  const [stake, setStake] = useState("");
  const [starting, setStarting] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = `${selection}\nOdds: ${odd(odds)}\nStake: ${money(stakeCents)}`;
  const cents = Math.round(Number(stake) * 100);
  const validOdds =
    Number.isFinite(Number(actualOdds)) && Math.abs(Number(actualOdds)) >= 100;
  const payout =
    cents > 0 && validOdds ? cents + winProfit(cents, Number(actualOdds)) : 0;

  async function copy() {
    if (busy) return;
    setBusy(true);
    try {
      try {
        await navigator.clipboard.writeText(text);
        setManual(false);
        setStatus("Published pick copied.");
      } catch {
        setManual(true);
        setStatus("Select and copy the published pick below.");
      }
      if (!track || Date.now() >= Date.parse(track.kickoff)) return;
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setStatus(
          "Pick ready to copy. Sign in to record your wager and track your bankroll.",
        );
        return;
      }
      const [account, entry] = await Promise.all([
        supabase
          .from("personal_challenges")
          .select("starting_cents")
          .eq("challenge_id", track.challengeId)
          .maybeSingle(),
        supabase
          .from("personal_entry_state")
          .select("id")
          .eq("pick_id", track.pickId)
          .maybeSingle(),
      ]);
      if (account.error || entry.error)
        throw new Error(
          "Could not check your entries. Nothing was recorded; please retry.",
        );
      if (entry.data) {
        setStatus(
          "Pick copied. You’re already tracking this entry—no duplicate added.",
        );
        return;
      }
      setStarting(account.data?.starting_cents ?? null);
      setActualOdds(String(odds));
      setStake("");
      setError("");
      dialog.current?.showModal();
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Unable to open wager tracking.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!track || busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error: saveError } = await supabase.rpc("record_personal_entry", {
        p_pick_id: track.pickId,
        p_line: track.line === null ? null : Number(form.get("line")),
        p_odds: Number(actualOdds),
        p_stake_cents: cents,
        p_payout_cents: payout,
        p_book: String(form.get("book")),
        p_placed_at: new Date().toISOString(),
        p_starting_cents:
          starting ?? Math.round(Number(form.get("starting")) * 100),
      });
      if (saveError) throw saveError;
      dialog.current?.close();
      setStatus(
        "Entry recorded. Your bankroll now tracks this wager; matching-line results update automatically when graded.",
      );
      window.dispatchEvent(new Event("vq-personal-entry-changed"));
      window.dispatchEvent(new Event("vq-community-changed"));
    } catch (e) {
      setError(
        (e as { message?: string }).message ||
          "Unable to record your entry. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="copy-pick">
      <button type="button" disabled={busy} onClick={() => void copy()}>
        {busy ? "Please wait…" : "Copy Pick"}
      </button>
      <span role="status" aria-live="polite">
        {status}
      </span>
      {manual && (
        <textarea
          aria-label="Published pick to copy"
          readOnly
          value={text}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {track && (
        <dialog
          ref={dialog}
          className="entry-dialog"
          aria-labelledby={`track-${track.pickId}`}
        >
          <h2 id={`track-${track.pickId}`}>How much did you wager?</h2>
          <p>{selection}</p>
          <form className="member-form" onSubmit={save}>
            <label className="field">
              Your wager ($)
              <input
                autoFocus
                required
                type="number"
                inputMode="decimal"
                min="0.01"
                max="1000000"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </label>
            {starting === null && (
              <label className="field">
                Your starting bankroll ($)
                <input
                  name="starting"
                  required
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  defaultValue="20"
                />
              </label>
            )}
            <label className="field">
              Your actual odds
              <input
                required
                type="text"
                inputMode="text"
                pattern="[+-]?[0-9]+([.][0-9]+)?"
                value={actualOdds}
                onChange={(e) => setActualOdds(e.target.value)}
              />
            </label>
            {track.line !== null && (
              <label className="field">
                Your actual line
                <input
                  name="line"
                  required
                  type="number"
                  step="any"
                  defaultValue={track.line}
                />
              </label>
            )}
            <label className="field">
              Sportsbook
              <select name="book" required defaultValue="">
                <option value="" disabled>
                  Choose sportsbook
                </option>
                <option>FanDuel</option>
                <option>DraftKings</option>
                <option>Other</option>
              </select>
            </label>
            <p>
              Total return if win:{" "}
              <strong>{payout ? money(payout) : "—"}</strong> (includes your
              stake).
            </p>
            <label>
              <input type="checkbox" required /> I placed this cash wager at the
              details above. No boost or free bet.
            </label>
            <small>
              This records your entry, not a sportsbook bet. Confirm your actual
              price; the original Vegas Quant price stays locked. Different
              lines may need a separate result review.
            </small>
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={busy || !payout}>
              {busy ? "Saving…" : "Confirm tail & update bankroll"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Just copy · Don’t track
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}
