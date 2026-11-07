"use client";

import { useEffect, useState } from "react";
import "./nba-threes-card-preview.css";

/** A failed PNG must never turn the complete research into broken-image alt text. */
export function NbaThreesCardPreview({
  day,
  body,
}: {
  day: string;
  body: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retryToken, setRetryToken] = useState("");
  const base = `/api/nba/threes-card/${day}`;
  const src = retryToken ? `${base}?retry=${retryToken}` : base;

  function retry() {
    setLoaded(false);
    setFailed(false);
    setAttempt((n) => n + 1);
    setRetryToken(`${Date.now()}-${attempt + 1}`);
  }

  useEffect(() => {
    if (!failed || attempt !== 0) return;
    const timer = window.setTimeout(() => {
      setFailed(false);
      setAttempt(1);
      setRetryToken(`${Date.now()}-1`);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [failed, attempt]);

  return (
    <>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={`3-point volume for ${day}. Full research is available below.`}
          width={1080}
          height={1350}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
      {failed && (
        <div className="threes-card-unavailable" role="status">
          <strong>Card image unavailable</strong>
          <p>
            {attempt === 0
              ? "Retrying the image…"
              : "You can still read the original research below."}
          </p>
          {attempt > 0 && (
            <button
              type="button"
              onClick={retry}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              Retry image
            </button>
          )}
        </div>
      )}
      <figcaption className="threes-card-caption">
        <details open={failed}>
          <summary>Original research and sources</summary>
          <p>{body}</p>
        </details>
        {loaded && (
          <a href={src} download={`vegas-quant-3-point-volume-${day}.png`}>
            Download card
          </a>
        )}
      </figcaption>
    </>
  );
}
