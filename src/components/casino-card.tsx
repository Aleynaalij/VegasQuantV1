"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Download } from "lucide-react";
import BrandMark, { markSvg } from "./brand-mark";
import { time } from "@/lib/domain";
import {
  CARD_H,
  CARD_W,
  LEG_SUITS,
  THEMES,
  cardRank,
  drawCasinoCard,
  suitColor,
  type CasinoCardData,
} from "@/lib/casino-card";
import "./casino-card.css";

function Corner({ data, flip = false }: { data: CasinoCardData; flip?: boolean }) {
  const rank = cardRank(data),
    t = THEMES[data.variant];
  return (
    <span className={`vqc-corner ${flip ? "vqc-corner-flip" : ""}`} aria-hidden="true">
      {rank === "JOKER" ? (
        <b className="vqc-joker">{[..."JOKER"].map((c, i) => <span key={i}>{c}</span>)}</b>
      ) : (
        <b className={rank.length > 2 ? "vqc-rank-long" : ""}>{rank}</b>
      )}
      <i>{t.suit}</i>
    </span>
  );
}

/** The face of a Vegas Quant card. Controls (copy, tail, details) stay outside the card. */
export default function CasinoCard({ data }: { data: CasinoCardData }) {
  const t = THEMES[data.variant];
  return (
    <article
      className={`vqc vqc-${data.variant}${data.stamp ? " vqc-stamped" : ""}`}
      style={
        {
          "--vqc-accent": t.accent,
          "--vqc-accent-soft": t.accentSoft,
          "--vqc-gold": t.gold,
          "--vqc-felt-a": t.felt[0],
          "--vqc-felt-b": t.felt[1],
          "--vqc-suit": t.suitColor,
        } as CSSProperties
      }
      aria-label={[data.eyebrow, data.title, data.market, data.stamp].filter(Boolean).join(" · ")}
    >
      <BrandMark className="vqc-watermark" />
      <Corner data={data} />
      <Corner data={data} flip />
      {data.stamp && <span className="vqc-stamp">{data.stamp}</span>}
      <div className="vqc-face">
        <p className="vqc-eyebrow">{data.eyebrow}</p>
        <h2 className="vqc-title">{data.title}</h2>
        {data.market && <p className="vqc-market">{data.market}</p>}
        {data.matchup && <p className="vqc-matchup">{data.matchup}</p>}
        {data.hero && (
          <div className="vqc-hero">
            <small>{data.hero.label}</small>
            <strong>{data.hero.value}</strong>
            {data.hero.note && <span>{data.hero.note}</span>}
          </div>
        )}
        {data.price && <span className="vqc-price">{data.price}</span>}
        {!!data.legs?.length && (
          <ol className="vqc-legs">
            {data.legs.map((leg, i) => {
              const suit = LEG_SUITS[i % 4];
              return (
                <li key={`${leg.name}-${i}`} className={leg.status ? `vqc-leg-${leg.status}` : ""}>
                  <i style={{ color: suitColor(suit) }} aria-hidden="true">{suit}</i>
                  <span>
                    <b>{leg.name}</b>
                    <small>
                      {leg.market}
                      {leg.note ? ` · ${leg.note}` : ""}
                    </small>
                  </span>
                  {leg.status && leg.status !== "open" && (
                    <em aria-label={leg.status === "won" ? "Leg won" : leg.status === "lost" ? "Leg lost" : "Push"}>
                      {leg.status === "won" ? "✓" : leg.status === "lost" ? "✕" : "–"}
                    </em>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {data.footnote && <p className="vqc-footnote">{data.footnote}</p>}
        <footer className="vqc-foot">
          <span>VEGAS QUANT</span>
          <time dateTime={data.publishedAt}>{time(data.publishedAt)}</time>
        </footer>
      </div>
    </article>
  );
}

let markImage: Promise<HTMLImageElement | null> | null = null;
/** The logo as an image for the canvas. */
function loadMark() {
  markImage ||= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markSvg());
  });
  return markImage;
}

/** "Download card": renders the same card as a 1080 × 1512 PNG, with preview, save and share. */
export function CasinoCardDownload({ data, label = "Download card" }: { data: CasinoCardData; label?: string }) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const blob = useRef<Blob | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const filename = `vegas-quant-${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "card"}.png`;
  async function render() {
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Image export unavailable");
      const css = getComputedStyle(document.body);
      const display = css.getPropertyValue("--font-display").trim() || "Arial";
      const bodyFont = css.getPropertyValue("--font-body").trim() || "Arial";
      await document.fonts?.ready;
      drawCasinoCard(ctx, data, { display: `${display}, Arial, sans-serif`, body: `${bodyFont}, Arial, sans-serif` }, await loadMark());
      const png = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(Error("Export failed"))), "image/png"));
      blob.current = png;
      setUrl(URL.createObjectURL(png));
    } catch {
      setError("The card couldn’t be created. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    const file = blob.current && new File([blob.current], filename, { type: "image/png" });
    if (file && navigator.canShare?.({ files: [file] }))
      await navigator.share({ files: [file], title: data.title }).catch(() => {});
  }
  return (
    <div className="vqc-download">
      {!url ? (
        <button type="button" className="secondary" onClick={() => void render()} disabled={busy}>
          <Download size={18} aria-hidden="true" /> {busy ? "Dealing your card…" : label}
        </button>
      ) : (
        <div className="vqc-preview">
          {/* Locally rendered PNG of the card above. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${data.title} card`} width={CARD_W} height={CARD_H} />
          <div>
            <a className="primary" href={url} download={filename}>Save image</a>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" className="secondary" onClick={() => void share()}>Share</button>
            )}
            <button type="button" className="text-link" onClick={() => setUrl("")}>Close</button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
