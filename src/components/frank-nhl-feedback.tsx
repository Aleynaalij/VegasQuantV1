"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  emptyFeedback,
  feedbackQuestions,
  feedbackState,
  type FeedbackAnswers,
  type FeedbackState,
} from "@/lib/frank-nhl-feedback";
import "./frank-nhl-feedback.css";

/** A nonblocking, server-recipient-verified Home request. No polling or public posts. */
export default function FrankNhlFeedback() {
  const [state, setState] = useState<FeedbackState>({ state: "hidden" }),
    [open, setOpen] = useState(false),
    [answers, setAnswers] = useState(emptyFeedback),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const epoch = useRef(0),
    sending = useRef(false),
    pending = useRef<{ id: string; body: string } | null>(null);
  useEffect(() => {
    async function load() {
      const n = ++epoch.current;
      try {
        const session = await supabase.auth.getSession();
        if (n !== epoch.current || !session.data.session) return;
        const r = await supabase.rpc("frank_nhl_feedback", {
          p_action: "status",
        });
        if (n !== epoch.current || r.error) return;
        const next = feedbackState(r.data);
        setState(next);
        if (next.state === "submitted") setAnswers(next.answers);
      } catch {
        /* An optional request never blocks Home. */
      }
    }
    void load();
    const stop = onUserChange(() => {
      ++epoch.current;
      setState({ state: "hidden" });
      setAnswers(emptyFeedback());
      setOpen(false);
      setBusy(false);
      setError("");
      pending.current = null;
      sending.current = false;
      void load();
    });
    return () => {
      ++epoch.current;
      stop();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const clean = Object.fromEntries(
      feedbackQuestions.map(({ key }) => [key, answers[key].trim()]),
    ) as FeedbackAnswers;
    if (!Object.values(clean).some(Boolean)) {
      setError("Please answer at least one question.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    const n = epoch.current;
    try {
      const body = JSON.stringify(clean);
      if (pending.current?.body !== body)
        pending.current = { id: crypto.randomUUID(), body };
      const r = await supabase.rpc("frank_nhl_feedback", {
        p_action: "submit",
        p_answers: clean,
        p_request_id: pending.current.id,
      });
      if (n !== epoch.current) return;
      const next = feedbackState(r.data);
      if (r.error || next.state !== "submitted") throw Error("Save failed");
      setState(next);
      setAnswers(next.answers);
      setOpen(false);
      pending.current = null;
    } catch {
      if (n === epoch.current)
        setError(
          "Your answers could not be saved. They are still here—please try again.",
        );
    } finally {
      if (n === epoch.current) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  if (state.state === "hidden") return null;
  return (
    <section
      className="frank-nhl-feedback"
      aria-labelledby="frank-nhl-feedback-title"
    >
      <span className="eyebrow">FRANK × VEGAS QUANT</span>
      <h2 id="frank-nhl-feedback-title">Frank, help us build the NHL desk.</h2>
      {state.state === "submitted" && !open ? (
        <p role="status">
          Thanks, Frank. Your NHL feedback is saved for the Vegas Quant dev
          team.
        </p>
      ) : (
        <p>
          What should we track? Which players do you like, what would help in an
          expanded game report, and what else should the dev team know?
        </p>
      )}
      {!open ? (
        <button type="button" className="vq-btn" onClick={() => setOpen(true)}>
          {state.state === "submitted"
            ? "Update your NHL input"
            : "Share your NHL ideas"}
        </button>
      ) : (
        <form onSubmit={submit}>
          <p className="frank-feedback-note">
            Your answers are shared privately with the Vegas Quant dev team.
            Answer any or all questions.
          </p>
          {feedbackQuestions.map(({ key, label, hint }) => (
            <label key={key} htmlFor={"frank-nhl-" + key}>
              <strong>{label}</strong>
              <span>{hint}</span>
              <textarea
                id={"frank-nhl-" + key}
                name={key}
                value={answers[key]}
                maxLength={3000}
                rows={3}
                disabled={busy}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          {error ? <p role="alert">{error}</p> : null}
          <div className="frank-feedback-actions">
            <button className="vq-btn" disabled={busy} type="submit">
              {busy ? "Saving…" : "Send to the VQ dev team"}
            </button>
            <button
              className="vq-btn ghost"
              disabled={busy}
              type="button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
