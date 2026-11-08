"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { vqCardPalette } from "@/lib/vq-card-palette";

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
  const [image, setImage] = useState<{ url: string; height: number } | null>(null);
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  async function preview() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const width = 1080, padding = 72, contentWidth = width - padding * 2;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export unavailable");
      type Row = { text: string; y: number; font: string; color: string };
      const rows: Row[] = [];
      let y = 0;
      const palette = vqCardPalette(`${publishedAt}:${title}`);
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
        rows.push({ text: "VEGAS QUANT / THE ZONE", y, font: "bold 30px Arial", color: palette.gold });
        y += 86;
        for (const text of wrap(title, "bold 52px Arial")) {
          rows.push({ text, y, font: "bold 52px Arial", color: "#f6f3eb" }); y += 68;
        }
        y += 12;
        if (subtitle) for (const text of wrap(subtitle, "32px Arial")) {
          rows.push({ text, y, font: "32px Arial", color: "#cbc8bb" }); y += 45;
        }
        y += 16;
        rows.push({ text: `Published ${stamp}`, y, font: "28px Arial", color: "#cbc8bb" });
        y += 80;
      }
      header();
      for (const section of sections) {
        if (!section.text.trim()) continue;
        // Sources stay readable on a phone; full clickable URLs remain in The Zone.
        const text = section.heading === "Sources" || section.heading === "Source"
          ? section.text.replace(/https:\/\/[^\s]+/g, url => { try { return new URL(url).hostname; } catch { return url; } })
          : section.text;
        const headingLines = wrap(section.heading, "bold 34px Arial");
        const lines = wrap(text, "40px Arial");
        for (const heading of headingLines) {
          rows.push({ text: heading, y, font: "bold 34px Arial", color: palette.accent }); y += 48;
        }
        y += 12;
        for (const line of lines) {
          rows.push({ text: line, y, font: "40px Arial", color: "#f6f3eb" }); y += 56;
        }
        y += 42;
      }
      const height = Math.max(1920, y + 145);
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = palette.base;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = palette.gold;
      context.lineWidth = 2;
      context.strokeRect(24, 24, width - 48, height - 48);
      context.fillStyle = palette.accent;
      context.fillRect(24, 24, width - 48, 8);
      for (let watermarkY = 760; watermarkY < height - 200; watermarkY += 690) {
        context.save();
        context.translate(width / 2, watermarkY);
        context.rotate(-Math.PI / 6);
        context.globalAlpha = 0.1;
        context.fillStyle = palette.gold;
        context.font = "bold 116px Arial";
        context.textAlign = "center";
        context.fillText("Vegas Quant", 0, 0);
        context.restore();
      }
      for (const row of rows) {
        context.font = row.font;
        context.fillStyle = row.color;
        context.fillText(row.text, padding, row.y);
      }
      context.fillStyle = "#cbc8bb";
      context.font = "28px Arial";
      context.fillText("vegasquant.app", padding, height - 110);
      context.font = "24px Arial";
      context.fillText("Original publication. Verify current availability and price.", padding, height - 60);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(value => value ? resolve(value) : reject(new Error("Image export failed")), "image/png"),
      );
      setImage({ url: URL.createObjectURL(blob), height });
    } catch {
      setError("The card could not be created. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  const filename = `vegas-quant-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "card"}.png`;
  return (
    <div className="download-card" style={{ marginTop: 16 }}>
      <button type="button" className="secondary" onClick={() => void preview()} disabled={busy}>
        <Download size={18} aria-hidden="true" /> {busy ? "Creating card…" : label}
      </button>
      {image && (
        <div aria-label="Card preview" style={{ marginTop: 16, maxWidth: 390 }}>
          {/* Locally rendered PNG, shown in full before saving. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={`${title}, Vegas Quant card`} width={1080} height={image.height} style={{ display: "block", width: "100%", height: "auto", borderRadius: 16 }} />
          <a className="primary" style={{ display: "inline-flex", marginTop: 12 }} href={image.url} download={filename}>Save image</a>
          <button type="button" className="text-link" style={{ marginLeft: 12 }} onClick={() => setImage(null)}>Close preview</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
