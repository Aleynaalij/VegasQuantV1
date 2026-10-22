"use client";
import { useEffect, useState } from "react";
import BrandMark from "./brand-mark";
/** One brief welcome per document load; route navigation and data loading continue underneath. */
export default function BrandOpening() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 1800);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="vq-brand-opening" aria-hidden="true">
      <div className="vq-opening-emblem"><BrandMark /></div>
      <span className="vq-opening-name">VEGAS QUANT</span>
      <span className="vq-opening-enhanced"><b>|</b> Enhanced With NFL Next Gen Stats</span>
      <small>Historical data via nflverse</small>
    </div>
  );
}
