"use client";

import { useState } from "react";
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

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const width = 1080, padding = 72, contentWidth = width - padding * 2;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export unavailable");
      const rows: { text: string; y: number; font: string; color: string }[] = [];
      let y = 100;
      function add(text: string, size: number, weight: string, color: string, gap = 18) {
        const font = `${weight} ${size}px Arial, sans-serif`;
        context!.font = font;
        for (const paragraph of text.split(/\r?\n/)) {
          let line = "";
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const proposed = line ? `${line} ${word}` : word;
            if (context!.measureText(proposed).width <= contentWidth) { line = proposed; continue; }
            if (line) { rows.push({ text: line, y, font, color }); y += size * 1.45; line = ""; }
            // Long source URLs must wrap too.
            for (const character of word) {
              if (context!.measureText(line + character).width > contentWidth) {
                rows.push({ text: line, y, font, color }); y += size * 1.45; line = "";
              }
              line += character;
            }
          }
          if (line) { rows.push({ text: line, y, font, color }); y += size * 1.45; }
        }
        y += gap;
      }
      add("VEGAS QUANT / THE ZONE", 24, "bold", "#80aaff", 30);
      add(title, 46, "bold", "#f0f4fc", 22);
      if (subtitle) add(subtitle, 26, "normal", "#b5c2d6");
      const date = new Date(publishedAt);
      const stamp = Number.isFinite(date.getTime())
        ? date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"
        : "Publication time unavailable";
      add(`Published ${stamp}`, 22, "normal", "#b5c2d6", 32);
      for (const section of sections) {
        if (!section.text.trim()) continue;
        add(section.heading, 24, "bold", "#70e1b6", 8);
        add(section.text, 28, "normal", "#f0f4fc", 32);
      }
      add("vegasquant.app | Original publication. Verify current availability and price.", 22, "normal", "#b5c2d6", 0);
      const height = Math.max(700, Math.ceil(y + padding));
      if (height > 16000) throw new Error("Card too large");
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#0b1424";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#142136";
      context.fillRect(24, 24, width - 48, height - 48);
      context.fillStyle = "#70e1b6";
      context.fillRect(24, 24, width - 48, 8);
      // Repeat the brand throughout tall cards, as well as in the header/footer.
      for (let watermarkY = 430; watermarkY < height; watermarkY += 700) {
        context.save();
        context.translate(width / 2, watermarkY);
        context.rotate(-Math.PI / 6);
        context.globalAlpha = 0.13;
        context.fillStyle = "#ffffff";
        context.font = "bold 116px Arial, sans-serif";
        context.textAlign = "center";
        context.fillText("Vegas Quant", 0, 0);
        context.restore();
      }
      for (const row of rows) {
        context.font = row.font;
        context.fillStyle = row.color;
        context.fillText(row.text, padding, row.y);
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image export failed")), "image/png"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vegas-quant-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "card"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("Download unavailable. Please retry or download an individual leg.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ marginTop: 16 }}>
    <button type="button" className="secondary" onClick={() => void download()} disabled={busy}>
      <Download size={18} aria-hidden="true" /> {busy ? "Creating image…" : label}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
