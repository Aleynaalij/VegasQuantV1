"use client";
import { useState } from "react";
import { normalizeKalshiSourceLink } from "@/lib/kalshi-source-link";

/** No unfurl, account connection, clipboard read or automatic navigation. */
export default function KalshiSourceLink({
  source,
}: {
  source: string | null | undefined;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [show, setShow] = useState(false);
  const url = normalizeKalshiSourceLink(source);
  if (!url) return null;
  return (
    <div className="ruby-source-link" style={{ overflowWrap: "anywhere", display: "grid", gap: 12 }}>
      <p>
        <b>Contributor-shared Kalshi link</b> · Not a verified ticket, executed
        position or VQ endorsement.
      </p>
      <button className="secondary" type="button" onClick={() => setShow((v) => !v)}>
        Open source on Kalshi ↗
      </button>
      {show ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p>Destination: {url}</p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              style={{ flex: "0 0 auto", marginTop: 4 }}
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>I am 21+ and meet Kalshi’s eligibility requirements.</span>
          </label>
          {confirmed ? (
            <a className="secondary" href={url} target="_blank" rel="noopener noreferrer">
              Continue to Kalshi ↗
            </a>
          ) : null}
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setShow(false);
              setConfirmed(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
