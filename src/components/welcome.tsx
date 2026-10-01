"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const VERSION = 1;

export default function Welcome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // This metadata is a UI preference, never an authorization or payment check.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user ?? null;
      setUser(current);
      setOpen(Boolean(current && current.user_metadata.vq_welcome_version !== VERSION));
    });
    const show = () => { setError(""); setOpen(true); };
    window.addEventListener("vq:welcome", show);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("vq:welcome", show);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function acknowledge() {
    setBusy(true);
    setError("");
    try {
      if (user) {
        const { error } = await supabase.auth.updateUser({ data: {
          vq_welcome_version: VERSION,
          vq_welcome_acknowledged_at: new Date().toISOString(),
        } });
        if (error) throw error;
      }
      setOpen(false);
    } catch {
      setError("We couldn’t save this yet. Try again, or continue and we’ll remind you next time.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="vq-welcome" aria-labelledby="welcome-title"
      aria-describedby="welcome-intro" onCancel={(event) => event.preventDefault()}>
      <div className="vq-welcome-content">
        <p className="vq-welcome-eyebrow">WELCOME TO VEGAS QUANT</p>
        <h2 id="welcome-title">Five stages.<br />Your run starts here.</h2>
        <p id="welcome-intro">Join the 5-Spot Challenge, follow the decisions, and see how the run unfolds. No wager is required.</p>
        <div className="vq-welcome-sections">
          <section><h3>Choose your way to play</h3><p>Follow Along for free, or Track My Bets to record wagers you already placed. Checking in never creates a bet.</p></section>
          <section><h3>Research when you want it</h3><p>A season pass unlocks Vegas Quant Ultra’s analysis and official slips. No qualifying edge? The challenge pauses. The $20 experiment’s roughly $640 target is aspirational.</p></section>
          <section className="vq-welcome-risk"><h3>Know the limits</h3><p>This is analysis and entertainment, not a sportsbook or an investment strategy. We do not accept or place bets. Projections can be wrong, and no pick or profit is guaranteed. Any wager can lose, including your entire stake. Only risk money you can afford to lose.</p></section>
        </div>
        {error && <p role="alert" className="vq-welcome-error">{error}</p>}
      </div>
      <footer className="vq-welcome-footer">
        <button type="button" disabled={busy} onClick={() => void acknowledge()}>{busy ? "Saving…" : "I understand — continue"}</button>
        {error && <button type="button" className="vq-welcome-retry" onClick={() => setOpen(false)}>Continue without saving</button>}
        <small>Better decisions. No promises.</small>
      </footer>
    </dialog>
  );
}
