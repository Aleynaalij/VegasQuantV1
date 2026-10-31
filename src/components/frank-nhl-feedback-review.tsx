"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useIsAdmin } from "@/lib/use-admin";
import {
  feedbackQuestions,
  feedbackState,
  type FeedbackAnswers,
} from "@/lib/frank-nhl-feedback";
import { Shell } from "./ui";
import "./frank-nhl-feedback.css";
type Entry = { id: string; answers: FeedbackAnswers; submitted_at: string };
export default function FrankNhlFeedbackReview() {
  const admin = useIsAdmin(),
    [rows, setRows] = useState<Entry[] | null>(null),
    [error, setError] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null);
    setError(false);
    if (admin)
      void Promise.resolve(supabase.rpc("frank_nhl_feedback_review"))
        .then((r) => {
          if (!live) return;
          if (r.error || !Array.isArray(r.data)) {
            setError(true);
            return;
          }
          const entries: Entry[] = [];
          for (const item of r.data) {
            const p = feedbackState({ ...item, state: "submitted" });
            if (p.state === "submitted" && typeof item.id === "string")
              entries.push({
                id: item.id,
                answers: p.answers,
                submitted_at: p.submitted_at,
              });
          }
          setRows(entries);
        })
        .catch(() => {
          if (live) setError(true);
        });
    return () => {
      live = false;
    };
  }, [admin, refresh]);
  return (
    <Shell active="admin">
      <section className="frank-nhl-feedback">
        <span className="eyebrow">PRIVATE DEVELOPMENT INPUT</span>
        <h1>Frank’s NHL feedback</h1>
        {admin === null ? (
          <p role="status">Checking admin access…</p>
        ) : !admin ? (
          <p>
            An MFA-verified admin account is required to review this feedback.
          </p>
        ) : (
          <>
            <p>
              Private input for the Vegas Quant dev team. Review these requests
              before turning them into NHL build tasks. Newest submissions
              appear first.
            </p>
            <button
              type="button"
              className="vq-btn ghost"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Refresh feedback
            </button>
            {error ? (
              <p role="alert">Feedback could not load. Please retry.</p>
            ) : rows === null ? (
              <p role="status">Loading feedback…</p>
            ) : !rows.length ? (
              <p>No NHL feedback has been submitted yet.</p>
            ) : (
              rows.map((row) => (
                <article className="frank-feedback-entry" key={row.id}>
                  <h2>
                    Frank ·{" "}
                    {new Date(row.submitted_at).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    ET
                  </h2>
                  {feedbackQuestions.map(({ key, label }) => (
                    <div key={key}>
                      <h3>{label}</h3>
                      <p>{row.answers[key] || "Not answered."}</p>
                    </div>
                  ))}
                </article>
              ))
            )}
          </>
        )}
      </section>
    </Shell>
  );
}
