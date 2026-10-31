"use client";
import { useId, useMemo, useState } from "react";
import { MARK_PATHS } from "./brand-mark";
import GamblyLink from "./gambly-link";
import {
  PUBLICATION_COLORS,
  publicationCopy,
  publicationPages,
  publicationStamp,
  type PublicationPost,
} from "@/lib/zone-publication-card";
import { isSport } from "@/lib/sports";
import "./zone-publication-card.css";

/** The existing 3-point research frame/fonts/monogram, adapted to editorial publications.
 * Original nba-threes image rendering remains completely separate and unchanged. */
export default function ZonePublicationCard({
  post: p,
}: {
  post: PublicationPost;
}) {
  const [page, setPage] = useState(0),
    [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false),
    [busy, setBusy] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""),
    pages = useMemo(() => publicationPages(p), [p]);
  if (!isSport(p.sport)) return null;
  const theme = PUBLICATION_COLORS[p.sport],
    index = Math.min(page, pages.length - 1),
    current = pages[index];
  const headline = `${theme.label} ${p.legs.length ? "PICKS" : "UPDATE"}`;
  const stamp = publicationStamp(p.created_at),
    copyText = publicationCopy(p);
  const footer = p.legs.length
    ? "Qualitative editorial · verify current line and availability"
    : "Vegas Quant publication · original analysis and sources";
  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setManual(false);
    } catch {
      setManual(true);
      setError("Automatic copy failed. Select and copy your picks below.");
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const css = getComputedStyle(document.body),
        board = css.getPropertyValue("--font-board").trim(),
        body = css.getPropertyValue("--font-body").trim();
      await Promise.all([
        document.fonts.load(`800 128px ${board}`),
        document.fonts.load(`700 48px ${body}`),
        document.fonts.load(`500 32px ${body}`),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const c = canvas.getContext("2d");
      if (!c) throw Error("Canvas unavailable");
      c.fillStyle = "#07090d";
      c.fillRect(0, 0, 1080, 1350);
      const glow = c.createRadialGradient(540, -135, 0, 540, -135, 950);
      glow.addColorStop(0, theme.glow);
      glow.addColorStop(1, "#07090d");
      c.fillStyle = glow;
      c.fillRect(0, 0, 1080, 1350);
      c.strokeStyle = theme.accent + "66";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(28, 28, 1024, 1294, 28);
      c.stroke();
      c.save();
      c.translate(74, 70);
      c.scale(64 / 480, 48 / 360);
      for (const [fill, d] of MARK_PATHS) {
        c.fillStyle = fill;
        c.fill(new Path2D(d));
      }
      c.restore();
      const text = (
        s: string,
        x: number,
        y: number,
        size: number,
        color: string,
        weight = 500,
        family = body,
      ) => {
        c.font = `${weight} ${size}px ${family}`;
        c.fillStyle = color;
        c.fillText(s, x, y);
      };
      text("V E G A S  Q U A N T", 152, 102, 22, "#f4dc99", 700);
      c.strokeStyle = theme.accent + "88";
      c.beginPath();
      c.roundRect(800, 76, 206, 40, 20);
      c.stroke();
      text(theme.label, 828, 103, 20, theme.accent, 700);
      text(headline, 74, 260, 128, theme.accent, 800, board);
      current.title.forEach((line, n) =>
        text(line, 74, 324 + n * 58, 48, "#f2f4f5", 700),
      );
      text(
        `${stamp} · ${index + 1} / ${pages.length}`,
        74,
        current.start - 46,
        24,
        "#8f99a3",
      );
      c.strokeStyle = theme.accent + "55";
      c.beginPath();
      c.moveTo(74, current.start - 25);
      c.lineTo(1006, current.start - 25);
      c.stroke();
      current.lines.forEach((line, n) =>
        text(line, 74, current.start + n * 42, 32, "#d9dee2"),
      );
      text(footer, 74, 1246, 24, "#8f99a3");
      text("VEGASQUANT.APP", 74, 1284, 24, theme.accent, 700);
      const blob = await new Promise<Blob>((ok, fail) =>
        canvas.toBlob(
          (b) => (b ? ok(b) : fail(Error("Export failed"))),
          "image/png",
        ),
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `vegas-quant-${p.sport}-${p.id}-${index + 1}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setError("The card could not download. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="zone-publication"
      data-sport={p.sport}
      aria-label={`${theme.label} Vegas Quant publication`}
    >
      <svg
        className="zone-publication-face"
        viewBox="0 0 1080 1350"
        role="img"
        aria-label={`${p.title}. ${stamp}. Page ${index + 1} of ${pages.length}. ${current.lines.join(" ")}`}
      >
        <defs>
          <radialGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            cx="540"
            cy="-135"
            r="950"
          >
            <stop stopColor={theme.glow} />
            <stop offset="1" stopColor="#07090d" />
          </radialGradient>
        </defs>
        <rect width="1080" height="1350" fill="#07090d" />
        <rect width="1080" height="1350" fill={`url(#${id})`} />
        <rect
          x="28"
          y="28"
          width="1024"
          height="1294"
          rx="28"
          fill="none"
          stroke={theme.accent + "66"}
          strokeWidth="2"
        />
        <g transform="translate(74 70) scale(.133333)">
          {MARK_PATHS.map(([fill, d], n) => (
            <path key={n} fill={fill} d={d} />
          ))}
        </g>
        <text x="152" y="102" className="publication-brand">
          V E G A S Q U A N T
        </text>
        <rect
          x="800"
          y="76"
          width="206"
          height="40"
          rx="20"
          fill="none"
          stroke={theme.accent + "88"}
        />
        <text
          x="828"
          y="103"
          fontSize="20"
          fill={theme.accent}
          fontWeight="700"
        >
          {theme.label}
        </text>
        <text
          x="74"
          y="260"
          className="publication-headline"
          fill={theme.accent}
        >
          {headline}
        </text>
        {current.title.map((line, n) => (
          <text
            key={n}
            x="74"
            y={324 + n * 58}
            fontSize="48"
            fontWeight="700"
            fill="#f2f4f5"
          >
            {line}
          </text>
        ))}
        <text x="74" y={current.start - 46} fontSize="24" fill="#8f99a3">
          {stamp} · {index + 1} / {pages.length}
        </text>
        <path
          d={`M74 ${current.start - 25} H1006`}
          stroke={theme.accent + "55"}
        />
        {current.lines.map((line, n) => (
          <text
            key={n}
            x="74"
            y={current.start + n * 42}
            fontSize="32"
            fill="#d9dee2"
          >
            {line}
          </text>
        ))}
        <text x="74" y="1246" fontSize="24" fill="#8f99a3">
          {footer}
        </text>
        <text
          x="74"
          y="1284"
          fontSize="24"
          fill={theme.accent}
          fontWeight="700"
        >
          VEGASQUANT.APP
        </text>
      </svg>
      {pages.length > 1 && (
        <div
          className="publication-controls"
          aria-label="Publication card pages"
        >
          <button
            type="button"
            className="secondary"
            disabled={index === 0}
            onClick={() => setPage(index - 1)}
          >
            Previous card
          </button>
          <span aria-live="polite">
            {index + 1} / {pages.length}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={index === pages.length - 1}
            onClick={() => setPage(index + 1)}
          >
            Next card
          </button>
        </div>
      )}
      <div className="publication-controls">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy
            ? "Creating card…"
            : `Download card${pages.length > 1 ? ` ${index + 1}` : ""}`}
        </button>
        {!!p.legs.length && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={() => void copy()}
            >
              {copied ? "Copied picks" : "Copy picks"}
            </button>
            <GamblyLink
              url="https://gambly.com"
              selection={copyText}
              label="Open with Gambly ↗"
            />
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {manual && (
        <textarea
          aria-label="Picks to copy manually"
          readOnly
          value={copyText}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <details className="publication-analysis">
        <summary>Full analysis and sources</summary>
        <p>{p.body}</p>
        {p.legs.some((l) => !p.body.includes(l)) && (
          <ol>
            {p.legs.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
