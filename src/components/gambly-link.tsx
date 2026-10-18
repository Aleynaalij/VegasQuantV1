"use client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import KalshiLink from "./kalshi-link";
import { isGamblyUrl } from "@/lib/gambly";

export default function GamblyLink({
  url,
  selection,
  label,
  kalshiLegKeys,
  beforeOpen,
  disabled = false,
  portalDialog = false,
}: {
  url: string;
  selection?: string;
  label?: string;
  kalshiLegKeys?: string[];
  beforeOpen?: () => Promise<boolean>;
  disabled?: boolean;
  portalDialog?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = useId();
  async function copy() {
    if (!selection || busy) return;
    setBusy(true);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(selection);
      setCopied(true);
    } catch {
      setCopyError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!isGamblyUrl(url)) return null;
  const modal = (
    <dialog className="entry-dialog" ref={dialog} aria-labelledby={title}>
      <h2 id={title}>
        {selection ? "Copy here. Paste in Gambly." : "You must be 21 or older"}
      </h2>
      {selection && (
        <p className="notice">
          <strong>
            Before you leave: copy the pick below. On Gambly, press and hold the
            chat box, tap PASTE, then press Enter or Send. The pick will not
            appear there automatically.
          </strong>
        </p>
      )}
      <p>
        Vegas Quant is for adults 21+. You must meet their age and location
        requirements.
      </p>
      <label
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{" "}
        I confirm I am 21 or older.
      </label>
      {confirmed && selection && !copied && !copyError && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void copy()}
        >
          {busy ? "Copying…" : "Copy pick to clipboard"}
        </button>
      )}
      {copied && (
        <p className="notice" role="status">
          <strong>
            YOUR PICK IS COPIED TO YOUR CLIPBOARD. On the next site, PASTE it
            into Gambly’s chat box, then press Enter or Send.
          </strong>
        </p>
      )}
      {copyError && (
        <div role="alert">
          <p>
            <strong>
              Automatic copy failed. Copy the text below yourself, then paste it
              into Gambly’s chat box.
            </strong>
          </p>
          <textarea
            aria-label="Pick to copy manually"
            readOnly
            value={selection}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
      {confirmed && (!selection || copied || copyError) && (
        <a
          className="btn primary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => dialog.current?.close()}
        >
          {copyError
            ? "I copied the text · Open Gambly ↗"
            : selection
              ? "Open Gambly · Paste pick there ↗"
              : "Continue to Gambly ↗"}
        </a>
      )}
      <button className="btn" onClick={() => dialog.current?.close()}>
        Cancel
      </button>
    </dialog>
  );
  return (
    <>
      {kalshiLegKeys?.length ? <KalshiLink legKeys={kalshiLegKeys} /> : null}
      <button
        className="btn"
        disabled={disabled}
        onClick={async () => {
          if (beforeOpen && !(await beforeOpen())) return;
          setConfirmed(false);
          setCopyError(false);
          setCopied(false);
          dialog.current?.showModal();
        }}
      >
        {label ||
          (selection ? "Copy pick & open Gambly ↗" : "Open in Gambly ↗")}
      </button>
      {portalDialog && typeof document !== "undefined"
        ? createPortal(modal, document.body)
        : modal}
    </>
  );
}
