"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { NBA_PAUSED_MESSAGE, NBA_PAUSED_TITLE } from "@/lib/nba-paused";

/** The NBA chip while NBA is paused: a "Soon" sticker, and a short note on why when tapped. */
export default function NbaComingSoon() {
  const chip = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLDialogElement>(null);
  // A native modal dialog keeps focus inside it and closes on Escape.
  const open = () => {
    if (!note.current?.open) note.current?.showModal();
  };
  const close = () => note.current?.close();
  useEffect(() => {
    // Old NBA links redirect to /?nba=soon; show the note on arrival.
    if (new URLSearchParams(window.location.search).get("nba") === "soon") open();
  }, []);
  return (
    <>
      <button ref={chip} type="button" className="nba-soon-chip" aria-haspopup="dialog" onClick={open}>
        NBA <span className="nba-soon-sticker">Soon</span>
      </button>
      <dialog
        ref={note}
        className="nba-soon-dialog"
        aria-labelledby="nba-soon-title"
        // Return focus to the chip however the note closes (button, Escape or backdrop).
        onClose={() => chip.current?.focus()}
        // A click on the dialog element itself is a click on its backdrop.
        onClick={(e) => e.target === note.current && close()}
      >
        <div className="nba-soon-body">
          <button type="button" className="nba-soon-close" aria-label="Close" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
          <span className="nba-soon-sticker">Coming soon</span>
          <h2 id="nba-soon-title">{NBA_PAUSED_TITLE}</h2>
          <p>{NBA_PAUSED_MESSAGE}</p>
          <button type="button" className="nba-soon-ok" autoFocus onClick={close}>
            Back to NFL
          </button>
        </div>
      </dialog>
    </>
  );
}
