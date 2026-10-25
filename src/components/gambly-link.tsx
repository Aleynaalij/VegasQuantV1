"use client";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import KalshiLink from "./kalshi-link";
import { isGamblyUrl } from "@/lib/gambly";

export default function GamblyLink({
  url,
  selection,
  image,
  label,
  kalshiLegKeys,
  kalshiTexts,
  beforeOpen,
  disabled = false,
  portalDialog = false,
}: {
  url: string;
  selection?: string;
  /** An image to copy instead of text, e.g. a contributor's slip screenshot (PNG). */
  image?: () => Promise<Blob>;
  label?: string;
  kalshiLegKeys?: string[];
  /** Typed legs to match on Kalshi when there are no published leg keys. */
  kalshiTexts?: string[];
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
  const copying = Boolean(selection || image);
  async function copy() {
    if (!copying || busy) return;
    setBusy(true);
    setCopyError(false);
    try {
      // The clipboard write starts inside the tap (Safari requires it); the image is a pending
      // ClipboardItem value that resolves once the screenshot has been prepared.
      if (selection) await navigator.clipboard.writeText(selection);
      else
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": image!() }),
        ]);
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
        {copying ? "Copy here. Paste in Gambly." : "You must be 21 or older"}
      </h2>
      {copying && (
        <p className="notice">
          <strong>
            Before you leave: copy the {selection ? "pick" : "screenshot"}{" "}
            below. On Gambly, press and hold the chat box, tap PASTE, then press
            Enter or Send. It will not appear there automatically.
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
      {confirmed && copying && !copied && !copyError && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => void copy()}
        >
          {busy
            ? "Copying…"
            : selection
              ? "Copy pick to clipboard"
              : "Copy screenshot to clipboard"}
        </button>
      )}
      {copied && (
        <p className="notice" role="status">
          <strong>
            YOUR {selection ? "PICK" : "SCREENSHOT"} IS COPIED TO YOUR
            CLIPBOARD. On the next site, PASTE it into Gambly’s chat box, then
            press Enter or Send.
          </strong>
        </p>
      )}
      {copyError && !selection && (
        <p role="alert">
          <strong>
            This browser can’t copy images automatically. Cancel, press and hold
            the screenshot on the card, choose Copy, then open Gambly and paste
            it into the chat box.
          </strong>
        </p>
      )}
      {copyError && selection && (
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
      {confirmed && (!copying || copied || copyError) && (
        <a
          className="btn primary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => dialog.current?.close()}
        >
          {copyError
            ? `I copied the ${selection ? "text" : "screenshot"} · Open Gambly ↗`
            : copying
              ? `Open Gambly · Paste ${selection ? "pick" : "screenshot"} there ↗`
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
      {kalshiLegKeys?.length || kalshiTexts ? (
        <KalshiLink legKeys={kalshiLegKeys} texts={kalshiTexts} />
      ) : null}
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
