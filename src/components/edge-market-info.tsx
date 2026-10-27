"use client";
import { useId, useRef, useState } from "react";
import { isMarketInfoUrl, marketInfoUrls } from "@/lib/market-info";

export default function EdgeMarketInfo({ url }: { url?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const titleId = useId();
  const destination = url ?? marketInfoUrls[0];
  if (!isMarketInfoUrl(destination)) return null;
  return <>
    <button className="text-link" onClick={() => { setConfirmed(false); dialog.current?.showModal(); }}>View Market Info ↗</button>
    <dialog className="entry-dialog" ref={dialog} aria-labelledby={titleId}>
      <h2 id={titleId}>For adults 18 and older</h2>
      <p>Vegas Quant is for adults 18+. This link opens an informational NFL odds page. Sportsbook age and location requirements may be higher.</p>
      <p>Current prices may differ. This edge card permanently preserves its original published number and price.</p>
      <label style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm I am 18 or older.
      </label>
      {confirmed ? <a className="primary" href={destination} target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()}>Continue to Market Info ↗</a> : null}
      <button className="secondary" onClick={() => dialog.current?.close()}>Cancel</button>
    </dialog>
  </>;
}
