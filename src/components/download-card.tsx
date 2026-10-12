"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

export type DownloadCardSection = { heading: string; text: string };

/** Exports supplied publication content only, never account details or UI controls. */
export default function DownloadCard({ title, subtitle, publishedAt, sections, label = "Download card" }: {
  title: string;
  subtitle?: string;
  publishedAt: string;
  sections: DownloadCardSection[];
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const urls = useRef<string[]>([]);
  const touchStart = useRef<number | null>(null);
  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), []);

  async function preview() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const width = 1080, height = 1920, padding = 72, contentWidth = width - padding * 2;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export unavailable");
      type Row = { text: string; y: number; font: string; color: string };
      const sheets: Row[][] = [];
      let rows: Row[] = [], y = 0;
      const date = new Date(publishedAt);
      const stamp = Number.isFinite(date.getTime())
        ? date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"
        : "Publication time unavailable";
      function wrap(text: string, font: string) {
        context!.font = font;
        const lines: string[] = [];
        for (const paragraph of text.split(/\r?\n/)) {
          let line = "";
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const proposed = line ? `${line} ${word}` : word;
            if (context!.measureText(proposed).width <= contentWidth) { line = proposed; continue; }
            if (line) { lines.push(line); line = ""; }
            for (const character of word) {
              if (context!.measureText(line + character).width > contentWidth) { lines.push(line); line = ""; }
              line += character;
            }
          }
          if (line) lines.push(line);
        }
        return lines;
      }
      function header() {
        y = 105;
        rows.push({ text: "VEGAS QUANT / THE ZONE", y, font: "bold 30px Arial", color: "#80aaff" });
        y += 86;
        for (const text of wrap(title, "bold 52px Arial")) {
          rows.push({ text, y, font: "bold 52px Arial", color: "#f0f4fc" }); y += 68;
        }
        y += 12;
        if (subtitle) for (const text of wrap(subtitle, "32px Arial")) {
          rows.push({ text, y, font: "32px Arial", color: "#b5c2d6" }); y += 45;
        }
        y += 16;
        rows.push({ text: `Published ${stamp}`, y, font: "28px Arial", color: "#b5c2d6" });
        y += 80;
      }
      function nextPage() { if (rows.length) sheets.push(rows); rows = []; header(); }
      header();
      for (const section of sections) {
        if (!section.text.trim()) continue;
        // Sources stay readable on a phone; full clickable URLs remain in The Zone.
        const text = section.heading === "Sources" || section.heading === "Source"
          ? section.text.replace(/https:\/\/[^\s]+/g, url => { try { return new URL(url).hostname; } catch { return url; } })
          : section.text;
        const headingLines = wrap(section.heading, "bold 34px Arial");
        const lines = wrap(text, "40px Arial");
        const blockHeight = headingLines.length * 48 + lines.length * 56 + 42;
        // Keep a normal section together; split long sections at line boundaries.
        if (y + Math.min(blockHeight, 340) > 1730 || (blockHeight < 1100 && y + blockHeight > 1730)) nextPage();
        for (const heading of headingLines) {
          rows.push({ text: heading, y, font: "bold 34px Arial", color: "#70e1b6" }); y += 48;
        }
        y += 12;
        for (const line of lines) {
          if (y > 1730) {
            nextPage();
            rows.push({ text: section.heading + " (continued)", y, font: "bold 34px Arial", color: "#70e1b6" }); y += 60;
          }
          rows.push({ text: line, y, font: "40px Arial", color: "#f0f4fc" }); y += 56;
        }
        y += 42;
      }
      sheets.push(rows);
      const nextUrls: string[] = [];
      try {
        for (let page = 0; page < sheets.length; page++) {
          canvas.width = width; canvas.height = height;
          context.fillStyle = "#0b1424"; context.fillRect(0, 0, width, height);
          context.fillStyle = "#142136"; context.fillRect(24, 24, width - 48, height - 48);
          context.fillStyle = "#70e1b6"; context.fillRect(24, 24, width - 48, 8);
          for (const watermarkY of [760, 1450]) {
            context.save(); context.translate(width / 2, watermarkY); context.rotate(-Math.PI / 6);
            context.globalAlpha = 0.13; context.fillStyle = "#ffffff"; context.font = "bold 116px Arial";
            context.textAlign = "center"; context.fillText("Vegas Quant", 0, 0); context.restore();
          }
          for (const row of sheets[page]) {
            context.font = row.font; context.fillStyle = row.color; context.fillText(row.text, padding, row.y);
          }
          context.fillStyle = "#b5c2d6"; context.font = "28px Arial";
          context.fillText(`vegasquant.app  |  ${page + 1} / ${sheets.length}`, padding, 1810);
          context.font = "24px Arial";
          context.fillText("Original publication. Verify current availability and price.", padding, 1860);
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image export failed")), "image/png"));
          nextUrls.push(URL.createObjectURL(blob));
        }
      } catch (cause) { nextUrls.forEach(url => URL.revokeObjectURL(url)); throw cause; }
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current = nextUrls;
      setPages(nextUrls); setActive(0);
    } catch { setError("Cards could not be created. Please retry."); }
    finally { setBusy(false); }
  }
  async function downloadSet() {
    setBusy(true); setError("");
    try {
      // A standard uncompressed ZIP avoids multiple-download permission prompts.
      const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
      let offset = 0;
      const crcTable = Array.from({ length: 256 }, (_, n) => {
        let crc = n; for (let k = 0; k < 8; k++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0;
      });
      const header = (size: number) => { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; };
      for (let i = 0; i < pages.length; i++) {
        const bytes = new Uint8Array(await (await fetch(pages[i])).arrayBuffer());
        const name = new TextEncoder().encode(`${filename}-${i + 1}.png`);
        let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
        const local = header(30 + name.length);
        local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true);
        local.view.setUint32(14, crc, true); local.view.setUint32(18, bytes.length, true); local.view.setUint32(22, bytes.length, true);
        local.view.setUint16(26, name.length, true); local.bytes.set(name, 30);
        const entry = header(46 + name.length);
        entry.view.setUint32(0, 0x02014b50, true); entry.view.setUint16(4, 20, true); entry.view.setUint16(6, 20, true);
        entry.view.setUint32(16, crc, true); entry.view.setUint32(20, bytes.length, true); entry.view.setUint32(24, bytes.length, true);
        entry.view.setUint16(28, name.length, true); entry.view.setUint32(42, offset, true); entry.bytes.set(name, 46);
        chunks.push(local.bytes, bytes); directory.push(entry.bytes); offset += local.bytes.length + bytes.length;
      }
      const end = header(22); end.view.setUint32(0, 0x06054b50, true);
      end.view.setUint16(8, pages.length, true); end.view.setUint16(10, pages.length, true);
      end.view.setUint32(12, directory.reduce((sum, entry) => sum + entry.length, 0), true); end.view.setUint32(16, offset, true);
      const zip = new Blob([...chunks, ...directory, end.bytes].map(bytes => bytes.buffer as ArrayBuffer), { type: "application/zip" });
      const url = URL.createObjectURL(zip); const link = document.createElement("a"); link.href = url; link.download = `${filename}-cards.zip`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { setError("The card set could not download. You can still download individual pages."); }
    finally { setBusy(false); }
  }
  const filename = `vegas-quant-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "card"}`;
  return <div style={{ marginTop: 16 }}>
    <button type="button" className="secondary" onClick={() => void preview()} disabled={busy}>
      <Download size={18} aria-hidden="true" /> {busy ? "Creating cards…" : label}
    </button>
    {pages.length > 0 && <div aria-label="Phone-size card preview" tabIndex={0} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setActive(index => Math.max(0, Math.min(pages.length - 1, index + (e.key === "ArrowRight" ? 1 : -1)))); } }} style={{ marginTop: 16, maxWidth: 390 }}>
      <div onTouchStart={e => { touchStart.current = e.changedTouches[0].clientX; }}
        onTouchEnd={e => { const start = touchStart.current; touchStart.current = null; if (start === null) return; const delta = e.changedTouches[0].clientX - start; if (Math.abs(delta) > 40) setActive(index => Math.max(0, Math.min(pages.length - 1, index + (delta < 0 ? 1 : -1)))); }}>
        {/* Local canvas-generated image; a fixed 9:16 page, never a scrolling screenshot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pages[active]} alt={`${title}, watermarked page ${active + 1} of ${pages.length}`} width={1080} height={1920} style={{ display: "block", width: "100%", height: "auto", borderRadius: 16 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
        <button type="button" className="secondary" aria-label="Previous card page" disabled={active === 0} onClick={() => setActive(active - 1)}>←</button>
        <span role="status">{active + 1} / {pages.length} · Swipe</span>
        <button type="button" className="secondary" aria-label="Next card page" disabled={active === pages.length - 1} onClick={() => setActive(active + 1)}>→</button>
      </div>
      <a className="primary" style={{ display: "inline-flex", marginTop: 12 }} href={pages[active]} download={`${filename}-${active + 1}.png`}>Download this page</a>
      {pages.length > 1 && <button type="button" className="secondary" style={{ marginTop: 12 }} disabled={busy} onClick={() => void downloadSet()}>Download all pages (.zip)</button>}
      <button type="button" className="text-link" style={{ marginLeft: 12 }} onClick={() => { setPages([]); }}>Close preview</button>
      <p style={{ fontSize: 13 }}>Each page is a separate phone-size image. Swipe, then download the pages you want.</p>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;

}
