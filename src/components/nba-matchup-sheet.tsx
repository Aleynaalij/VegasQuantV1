"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onUserChange } from "@/lib/auth-user";
import type { NbaSheetResponse } from "@/lib/nba-matchup-sheet";
import {
  fetchNbaMatchupSheet,
  matchupSheetImageUrl,
} from "@/lib/nba-matchup-sheet-client";
import { Shell } from "./ui";
import "./nba-matchup-sheet.css";

type SheetView = Omit<NbaSheetResponse, "svg"> & { image: string };

export default function NbaMatchupSheet({ id }: { id: string }) {
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [png, setPng] = useState("");
  const [error, setError] = useState("");
  const [exportFailed, setExportFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    let image = "",
      exportUrl = "";
    setSheet(null);
    setPng("");
    setError("");
    setExportFailed(false);
    setZoom(false);
    const stop = onUserChange(() => {
      abort.abort();
      setSheet(null);
      setPng("");
      setAttempt((n) => n + 1);
    });
    async function load() {
      try {
        const data = await fetchNbaMatchupSheet(id, abort.signal);
        if (abort.signal.aborted) return;
        image = matchupSheetImageUrl(data.svg);
        setSheet({
          title: data.title,
          summary: data.summary,
          sources: data.sources,
          image,
        });
        try {
          const img = new Image();
          img.src = image;
          await img.decode();
          if (abort.signal.aborted) return;
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth * 2;
          canvas.height = img.naturalHeight * 2;
          const context = canvas.getContext("2d");
          if (!context) throw Error("Canvas unavailable");
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (abort.signal.aborted) return;
          if (!blob) throw Error("PNG unavailable");
          exportUrl = URL.createObjectURL(blob);
          setPng(exportUrl);
        } catch {
          if (!abort.signal.aborted) setExportFailed(true);
        }
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Matchup sheet unavailable.",
          );
      }
    }
    void load();
    return () => {
      abort.abort();
      stop();
      if (image) URL.revokeObjectURL(image);
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, [id, attempt]);

  return (
    <Shell active="game" sport="nba">
      <section className="nba-sheet-view">
        <Link href="/community">← The Zone</Link>
        <h1>NBA Matchup Cheat Sheet</h1>
        {!sheet && !error && <p role="status">Loading matchup sheet…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>{" "}
            <Link href="/membership">Membership and sign-in</Link>
          </div>
        )}
        {sheet && (
          <>
            <div className="nba-sheet-controls">
              <h2>{sheet.title}</h2>
              <button
                type="button"
                onClick={() => setZoom(!zoom)}
                aria-pressed={zoom}
              >
                {zoom ? "Fit to screen" : "Zoom to read"}
              </button>
              {png && (
                <a
                  href={png}
                  download={`vegas-quant-${sheet.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
                >
                  Download PNG
                </a>
              )}
              {!png && !exportFailed && (
                <span role="status">Preparing PNG…</span>
              )}
              {exportFailed && (
                <span role="status">PNG unavailable. Reload to try again.</span>
              )}
            </div>
            <div
              className={`nba-sheet-scroll${zoom ? " is-zoomed" : ""}`}
              tabIndex={0}
              aria-label="Scrollable matchup sheet"
            >
              <img
                src={sheet.image}
                alt={`Vegas Quant research sheet for ${sheet.title}. Includes game lines, team and player form, three-point volume and injury status.`}
              />
            </div>
            <section className="nba-sheet-sources" aria-label="Matchup sources">
              <h2>Availability and sources</h2>
              <p>{sheet.summary}</p>
              <div>
                {sheet.sources.map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    target={href.startsWith("https://") ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    {label} ↗
                  </a>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </Shell>
  );
}
