"use client";
import { useEffect, useState } from "react";
import BrandMark from "./brand-mark";
/** Brief brand welcome on a fresh app load; never delays data or route navigation. */
export default function BrandOpening() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 950);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="vq-brand-opening" aria-hidden="true"><BrandMark /><span>VEGAS QUANT</span></div>;
}
