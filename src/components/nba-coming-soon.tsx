"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { NBA_PAUSED_MESSAGE, NBA_PAUSED_TITLE } from "@/lib/nba-paused";

/** The NBA chip while NBA is paused: a "Soon" sticker, and a short note on why when tapped. */
export default function NbaComingSoon() {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  // Old NBA links redirect to /?nba=soon; show the note on arrival.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nba") === "soon") setOpen(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" className="nba-soon-chip" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        NBA <span className="nba-soon-sticker">Soon</span>
      </button>
      {open && (
        <div className="nba-soon-backdrop" onClick={() => setOpen(false)}>
          <div
            className="nba-soon-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nba-soon-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button ref={close} type="button" className="nba-soon-close" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
            <span className="nba-soon-sticker">Coming soon</span>
            <h2 id="nba-soon-title">{NBA_PAUSED_TITLE}</h2>
            <p>{NBA_PAUSED_MESSAGE}</p>
            <button type="button" className="nba-soon-ok" onClick={() => setOpen(false)}>
              Back to NFL
            </button>
          </div>
        </div>
      )}
    </>
  );
}
