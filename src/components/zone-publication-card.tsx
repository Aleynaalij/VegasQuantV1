"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { MARK_PATHS } from "./brand-mark";
import GamblyLink from "./gambly-link";
import {
  PUBLICATION_LABELS,
  publicationCopy,
  publicationLayout,
  publicationStamp,
  watcherRows,
  type PublicationPost,
} from "@/lib/zone-publication-card";
import { vqCardPalette } from "@/lib/vq-card-palette";
import { isSport } from "@/lib/sports";
import "./zone-publication-card.css";

/** The existing 3-point research frame/fonts/monogram, adapted to editorial publications.
 * Original nba-threes image rendering remains completely separate and unchanged. */
export default function ZonePublicationCard({
  post: p,
}: {
  post: PublicationPost;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false),
    [busy, setBusy] = useState(false),
    [exported, setExported] = useState("");
  const id = useId().replace(/[^a-zA-Z0-9]/g, ""),
    watchers = useMemo(() => watcherRows(p), [p]),
    layout = useMemo(() => publicationLayout(p, !!watchers), [p, watchers]);
  useEffect(
    () => () => {
      if (exported) URL.revokeObjectURL(exported);
    },
    [exported],
  );
  if (!isSport(p.sport)) return null;
  const theme = vqCardPalette(p.id);
  const label = PUBLICATION_LABELS[p.sport];
  const { title, rows, start, height } = layout;
  const headline = watchers
    ? "WATCHLIST"
    : p.legs.length
      ? "PUBLISHED PICKS"
      : "RESEARCH UPDATE";
  const stamp = publicationStamp(p.created_at),
    copyText = publicationCopy(p);
  const footer = watchers
    ? "Watchlist only · not official picks · check lines and inactives"
    : p.legs.length
      ? "Published picks · verify current line and availability"
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
        body = css.getPropertyValue("--font-body").trim();
      await Promise.all([
        // Next's fallback faces reference local system fonts. Loading the entire family list
        // rejects when Arial Narrow is absent, even though our bundled font loaded correctly.
        document.fonts.load(`800 40px ${body.split(",")[0]}`),
        document.fonts.load(`700 60px ${body.split(",")[0]}`),
        document.fonts.load(`500 56px ${body.split(",")[0]}`),
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = height;
      const c = canvas.getContext("2d");
      if (!c) throw Error("Canvas unavailable");
      c.fillStyle = theme.base;
      c.fillRect(0, 0, 1080, height);
      const glow = c.createRadialGradient(540, -135, 0, 540, -135, 950);
      glow.addColorStop(0, theme.glow);
      glow.addColorStop(1, theme.base);
      c.fillStyle = glow;
      c.fillRect(0, 0, 1080, height);
      c.strokeStyle = theme.accent + "66";
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(28, 28, 1024, height - 56, 28);
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
      text("V E G A S Q U A N T", 152, 102, 22, "#f4dc99", 700);
      c.strokeStyle = theme.accent + "88";
      c.beginPath();
      c.roundRect(800, 76, 206, 40, 20);
      c.stroke();
      text(label, 828, 103, 20, theme.accent, 700);
      text(headline, 74, 204, 40, theme.accent, 800, body);
      title.forEach((line, n) =>
        text(line, 74, 260 + n * 72, 60, "#f5eedd", 700),
      );
      text(
        stamp,
        74,
        start - 110,
        40,
        "#c2cdbf",
      );
      c.strokeStyle = theme.accent + "55";
      c.beginPath();
      c.moveTo(74, start - 80);
      c.lineTo(1006, start - 80);
      c.stroke();
      if (watchers) {
        text("LINE", 74, 464, 22, theme.accent, 700);
        text("CONCERN", 540, 464, 22, theme.accent, 700);
        for (const row of watchers) {
          row.line.forEach((line, n) =>
            text(line, 74, row.y + n * 34, 26, "#f5eedd", 700),
          );
          row.risk.forEach((line, n) =>
            text(line, 540, row.y + n * 34, 26, "#e0e9df"),
          );
        }
      }
      rows.forEach((row) =>
        text(row.text, row.x, row.y, 56, row.pick ? "#f5eedd" : "#e0e9df"),
      );
      text(footer, 74, height - 104, 24, "#c2cdbf");
      text("VEGASQUANT.APP", 74, height - 66, 24, theme.accent, 700);
      const blob = await new Promise<Blob>((ok, fail) =>
        canvas.toBlob(
          (b) => (b ? ok(b) : fail(Error("Export failed"))),
          "image/png",
        ),
      );
      setExported(URL.createObjectURL(blob));
    } catch (cause) {
      console.error("Vegas Quant card export failed", cause);
      setError("The card could not download. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="zone-publication"
      data-sport={p.sport}
      data-palette={theme.name}
      aria-label={`${label} Vegas Quant publication`}
    >
      <p className="publication-time">
        {stamp} · Publication time, not a price observation.
      </p>
      <svg
        className="zone-publication-face"
        viewBox={`0 0 1080 ${height}`}
        role="img"
        aria-label={`${p.title}. ${stamp}. ${watchers ? p.body : rows.map((row) => row.text).join(" ")}`}
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
            <stop offset="1" stopColor={theme.base} />
          </radialGradient>
        </defs>
        <rect width="1080" height={height} fill={theme.base} />
        <rect width="1080" height={height} fill={`url(#${id})`} />
        <rect
          x="28"
          y="28"
          width="1024"
          height={height - 56}
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
          {label}
        </text>
        <text
          x="74"
          y="204"
          className="publication-headline"
          fill={theme.accent}
        >
          {headline}
        </text>
        {title.map((line, n) => (
          <text
            key={n}
            x="74"
            y={260 + n * 72}
            fontSize="60"
            fontWeight="700"
            fill="#f5eedd"
          >
            {line}
          </text>
        ))}
        <text x="74" y={start - 110} fontSize="40" fill="#c2cdbf">
          {stamp}
        </text>
        <path
          d={`M74 ${start - 80} H1006`}
          stroke={theme.accent + "55"}
        />
        {watchers && (
          <g>
            <text
              x="74"
              y="464"
              fontSize="22"
              fontWeight="700"
              fill={theme.accent}
            >
              LINE
            </text>
            <text
              x="540"
              y="464"
              fontSize="22"
              fontWeight="700"
              fill={theme.accent}
            >
              CONCERN
            </text>
            {watchers.map((row, i) => (
              <g key={i}>
                {row.line.map((line, n) => (
                  <text
                    key={n}
                    x="74"
                    y={row.y + n * 34}
                    fontSize="26"
                    fontWeight="700"
                    fill="#f5eedd"
                  >
                    {line}
                  </text>
                ))}
                {row.risk.map((line, n) => (
                  <text
                    key={n}
                    x="540"
                    y={row.y + n * 34}
                    fontSize="26"
                    fill="#e0e9df"
                  >
                    {line}
                  </text>
                ))}
              </g>
            ))}
          </g>
        )}
        {rows.map((row, n) => (
          <text
            key={n}
            x={row.x}
            y={row.y}
            fontSize="56"
            fill={row.pick ? "#f5eedd" : "#e0e9df"}
          >
            {row.text}
          </text>
        ))}
        <text x="74" y={height - 104} fontSize="24" fill="#c2cdbf">
          {footer}
        </text>
        <text
          x="74"
          y={height - 66}
          fontSize="24"
          fill={theme.accent}
          fontWeight="700"
        >
          VEGASQUANT.APP
        </text>
      </svg>
      <div className="publication-controls">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy ? "Creating card…" : "Download card"}
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
      {exported && (
        <div className="publication-controls">
          <a
            className="primary"
            href={exported}
            download={`vegas-quant-${p.sport}-${p.id}.png`}
          >
            Save image
          </a>
          <button
            type="button"
            className="secondary"
            onClick={() => setExported("")}
          >
            Close download
          </button>
        </div>
      )}
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
