"use client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
type Match = { key: string; label: string; url: string | null; status: string };
export default function KalshiLink({
  legKeys,
  label = "Find on Kalshi ↗",
  beforeOpen,
  disabled = false,
  portalDialog = false,
}: {
  legKeys: string[];
  label?: string;
  beforeOpen?: () => Promise<boolean>;
  disabled?: boolean;
  portalDialog?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [busy, setBusy] = useState(false),
    [results, setResults] = useState<Match[]>([]),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  async function check() {
    if (busy || disabled) return;
    if (beforeOpen && !(await beforeOpen())) return;
    setBusy(true);
    setResults([]);
    setError("");
    setConfirmed(false);
    dialog.current?.showModal();
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!legKeys.length) return;
      if (!token) throw Error("Sign in to check Kalshi.");
      const rows: Match[] = [];
      const unique = [...new Set(legKeys)];
      for (let i = 0; i < unique.length; i += 25) {
        const r = await fetch("/api/kalshi", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ keys: unique.slice(i, i + 25) }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.results)
          throw Error(
            data?.error || "Kalshi lookup unavailable. Please retry.",
          );
        rows.push(...data.results);
      }
      setResults(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check Kalshi.");
    } finally {
      setBusy(false);
    }
  }
  const modal = (
    <dialog ref={dialog} className="entry-dialog" aria-labelledby={title}>
      <h2 id={title}>Open selections on Kalshi</h2>
      <p>
        Exact player, game and target matches only. Review Kalshi’s current
        price and settlement rules. Sportsbook prices and VQ approval do not
        transfer to Kalshi.
      </p>
      {legKeys.length > 1 && (
        <p>
          Links open individual markets. This does not create a combined ticket.
        </p>
      )}
      {!legKeys.length && <p>No verified market mapping is available for this ticket. You can browse Kalshi; this does not copy or recreate the slip.</p>}
      {!legKeys.length && <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I am 21+ and meet Kalshi’s eligibility requirements.</label>}
      {!legKeys.length && confirmed && <p><a className="btn" href="https://kalshi.com" target="_blank" rel="noopener noreferrer">Browse Kalshi ↗</a></p>}
      {busy && <p role="status">Checking available markets…</p>}
      {error && <p role="alert">{error}</p>}
      {!!results.length && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            I am 21+ and meet Kalshi’s eligibility requirements.
          </label>
          <ul>
            {results.map((r) => (
              <li key={r.key}>
                <strong>{r.label}</strong>
                {r.url && confirmed ? (
                  <p>
                    <a
                      className="btn"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open on Kalshi ↗
                    </a>
                  </p>
                ) : (
                  <p>
                    {r.url
                      ? "Exact match found · confirm eligibility to open"
                      : r.status === "UNAVAILABLE"
                        ? "Kalshi lookup unavailable. Try again."
                        : "No exact available Kalshi match."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <button
        type="button"
        className="secondary"
        onClick={() => dialog.current?.close()}
      >
        Close
      </button>
    </dialog>
  );
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy || disabled}
        onClick={() => void check()}
      >
        {label}
      </button>
      {portalDialog && typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : modal}
    </>
  );
}
