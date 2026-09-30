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
        <h2 id="welcome-title">Research first.<br />Decisions with discipline.</h2>
        <p id="welcome-intro">Your sports analytics and decision-tracking desk. Understand the reasoning, follow the numbers, and learn from every outcome.</p>
        <div className="vq-welcome-sections">
          <section><h3>Understand the game</h3><p>Explore matchup research, market movement, projections, and analysis from Vegas Quant Ultra. A lean or watchlist is not an official pick.</p></section>
          <section><h3>Follow the process</h3><p>Track published picks, entry prices, closing-line value, results, and lessons. The 5-Spot Challenge starts at $20; its roughly $640 target is aspirational. No qualifying edge? We pass.</p></section>
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
