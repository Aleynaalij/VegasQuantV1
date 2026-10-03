"use client";
import { useId, useRef, useState } from "react";
import { isGamblyUrl } from "@/lib/gambly";

export default function GamblyLink({ url }: { url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const title = useId();
  if (!isGamblyUrl(url)) return null;
  return <>
    <button className="btn" onClick={() => { setConfirmed(false); dialog.current?.showModal(); }}>Open in Gambly ↗</button>
    <dialog className="entry-dialog" ref={dialog} aria-labelledby={title}>
      <h2 id={title}>You must be 18 or older</h2>
      <p>Vegas Quant is for adults 18+. Sportsbooks may require 21+ depending on your location. You must meet their age and location requirements.</p>
      <p>This opens Gambly in a new tab or its app. Odds may change; your original published Vegas Quant pick stays locked. Opening a link does not record a wager.</p>
      <label style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm I am 18 or older.
      </label>
      {confirmed && <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()}>Continue to Gambly ↗</a>}
      <button className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
    </dialog>
  </>;
}
