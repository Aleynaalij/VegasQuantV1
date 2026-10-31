"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  anniversaryDestination,
  anniversaryQuery,
  anniversaryState,
  anniversaryToken,
  celebrationDuration,
  type AnniversaryState,
} from "@/lib/frank-anniversary";
import "./frank-anniversary.css";

/** Mount inside the signed-in contributor's Corner, not the public capper card. */
export function FrankAnniversaryCorner() {
  const [state, setState] = useState<AnniversaryState>({ state: "hidden" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    async function load() {
      const version = ++epoch.current;
      try {
        const session = await supabase.auth.getSession();
        if (version !== epoch.current || !session.data.session) return;
        const r = await supabase.rpc("frank_anniversary", {
          p_action: "status",
        });
        if (version === epoch.current && !r.error)
          setState(anniversaryState(r.data));
      } catch {
        /* A surprise must never break the contributor desk. */
      }
    }
    void load();
    const stop = onUserChange(() => {
      ++epoch.current;
      setState({ state: "hidden" });
      setDismissed(false);
      setBusy(false);
      setError("");
      inFlight.current = false;
      void load();
    });
    return () => {
      ++epoch.current;
      stop();
    };
  }, []);

  useEffect(() => {
    if (state.state === "revealed") {
      window.location.assign(anniversaryDestination(state.token));
      return;
    }
    const el = dialog.current;
    if (!el || state.state !== "offer" || dismissed) return;
    el.showModal();
    return () => el.close();
  }, [state, dismissed]);

  async function reveal() {
    if (inFlight.current) return;
    inFlight.current = true;
    const version = epoch.current;
    setBusy(true);
    setError("");
    try {
      const r = await supabase.rpc("frank_anniversary", { p_action: "reveal" });
      if (version !== epoch.current) return;
      if (r.error) throw r.error;
      const next = anniversaryState(r.data);
      if (next.state === "hidden" || next.state === "done") setDismissed(true);
      else if (next.state !== "revealed") throw new Error("Missing handoff");
      setState(next);
    } catch {
      if (version === epoch.current)
        setError("Your surprise is still here. Tap Yes to try again.");
    } finally {
      if (version === epoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  if (state.state !== "offer" || dismissed) return null;
  return (
    <dialog
      ref={dialog}
      className="frank-anniversary-dialog"
      aria-labelledby="frank-anniversary-title"
      aria-describedby="frank-anniversary-invitation"
      onCancel={() => setDismissed(true)}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        const first = buttons?.[0],
          last = buttons?.[buttons.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <span className="frank-anniversary-mark" aria-hidden="true">
        VQ
      </span>
      <p className="frank-anniversary-eyebrow">
        A LITTLE SOMETHING FROM VEGAS QUANT
      </p>
      <h2 id="frank-anniversary-title">Happy anniversary, Frank!</h2>
      <p id="frank-anniversary-invitation">
        We have a surprise for you.
        <br />
        Do you want to know the surprise?
      </p>
      <div className="frank-anniversary-choices" aria-busy={busy}>
        <button type="button" disabled={busy} onClick={() => void reveal()}>
          Yes
        </button>
        <span aria-hidden="true">or</span>
        <button type="button" disabled={busy} onClick={() => void reveal()}>
          Yes
        </button>
      </div>
      {busy && <p role="status">Getting your surprise…</p>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}

/** Mount on the actual /nhl page, after its normal access/readiness boundaries. */
export function FrankAnniversaryFireworks() {
  const [visible, setVisible] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function arrive() {
      const version = ++epoch.current;
      const token = new URL(window.location.href).searchParams.get(
        anniversaryQuery,
      );
      if (!anniversaryToken(token)) return;
      try {
        const session = await supabase.auth.getSession();
        if (version !== epoch.current || !session.data.session) return;
        const r = await supabase.rpc("frank_anniversary", {
          p_action: "arrive",
          p_token: token,
        });
        if (version !== epoch.current || r.error) return;
        const next = anniversaryState(r.data);
        // Preserve every unrelated NHL query parameter and the current fragment.
        const url = new URL(window.location.href);
        url.searchParams.delete(anniversaryQuery);
        window.history.replaceState(
          window.history.state,
          "",
          url.pathname + url.search + url.hash,
        );
        if (next.state !== "celebrate") return;
        setVisible(true);
        timer = setTimeout(() => setVisible(false), celebrationDuration);
      } catch {
        /* Keep the handoff URL on network failure so reload can retry. */
      }
    }
    // A canceled mount (including React's development Strict Mode probe) must not
    // consume the server receipt before the real NHL view has mounted.
    const kickoff = setTimeout(() => void arrive(), 0);
    const stop = onUserChange(() => {
      ++epoch.current;
      if (timer) clearTimeout(timer);
      setVisible(false);
      void arrive();
    });
    return () => {
      ++epoch.current;
      clearTimeout(kickoff);
      if (timer) clearTimeout(timer);
      stop();
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      className="frank-anniversary-celebration"
      data-testid="frank-anniversary-fireworks"
    >
      <div className="frank-anniversary-sparks" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((burst) => (
          <div
            className="frank-anniversary-burst"
            key={burst}
            style={
              {
                "--burst-x": `${[20, 76, 48, 30, 82][burst]}%`,
                "--burst-y": `${[28, 38, 20, 62, 63][burst]}%`,
                "--delay": `${burst * 0.55}s`,
              } as CSSProperties
            }
          >
            {Array.from({ length: 14 }, (_, spark) => (
              <i
                key={spark}
                style={
                  {
                    "--spark-x": `${Math.cos((spark * Math.PI) / 7) * 135}px`,
                    "--spark-y": `${Math.sin((spark * Math.PI) / 7) * 135}px`,
                    "--spark-color": ["#f1d488", "#ffffff", "#76e0ca"][
                      spark % 3
                    ],
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="frank-anniversary-welcome" role="status">
        <span aria-hidden="true">✦</span>
        <div>
          <strong>Happy anniversary, Frank!</strong>
          <p>Surprise. Welcome to NHL.</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss anniversary celebration"
        >
          ×
        </button>
      </div>
    </div>
  );
}
