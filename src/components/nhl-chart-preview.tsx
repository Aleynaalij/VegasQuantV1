"use client";
import "./nhl-chart-preview.css";
import { useEffect, useRef, useState } from "react";
import { swipeStep } from "@/lib/tab-swipe";
import { supabase } from "@/lib/supabase";
import {
  isNhlChart,
  nhlStamp,
  type NhlChartSnapshot,
} from "@/lib/nhl-chart-package";
import { NbaThreesCardPreview } from "./nba-threes-card-preview";
export default function NhlChartPreview({
  id,
  body,
}: {
  id: string;
  body: string;
}) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<NhlChartSnapshot | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    supabase.rpc("nhl_chart_snapshot", { p_id: id }).then((r) => {
      if (!live) return;
      if (r.error || !isNhlChart(r.data)) {
        setFailed(true);
        return;
      }
      setData(r.data);
    });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  return (
    <section
      className="nhl-chart-package"
      data-no-tab-swipe
      aria-label="NHL research chart pages"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current =
          (e.target as HTMLElement).closest("details,nav,a,button") || !t
            ? null
            : { x: t.clientX, y: t.clientY, at: performance.now() };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        const end = e.changedTouches[0];
        if (start && end) {
          const step = swipeStep(
            end.clientX - start.x,
            end.clientY - start.y,
            performance.now() - start.at,
          );
          if (step) setPage((p) => Math.max(1, Math.min(9, p + step)));
        }
      }}
    >
      <nav
        aria-label="Chart pages"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label="Previous chart"
        >
          ←
        </button>
        <span aria-live="polite">
          {
            [
              "Matchup",
              "Away volume 1",
              "Away volume 2",
              "Home volume 1",
              "Home volume 2",
              "Away blocks",
              "Home blocks",
              "Away goalies & PP1",
              "Home goalies & PP1",
            ][page - 1]
          }{" "}
          · {page} / 9 · Swipe
        </span>
        <button
          type="button"
          disabled={page === 9}
          onClick={() => setPage((p) => p + 1)}
          aria-label="Next chart"
        >
          →
        </button>
      </nav>
      <NbaThreesCardPreview
        key={`${id}:${page}`}
        day={data?.day || ""}
        body={body}
        image={{
          src: `/api/nhl/chart/${id}/${page}`,
          alt: `NHL ${page === 1 ? "matchup" : page <= 5 ? "player volume" : page <= 7 ? "blocked shots" : "goalies and projected power play"} research chart. Full data and sources below.`,
          download: `vegas-quant-nhl-${id}-page-${page}.png`,
        }}
      />
      <a
        href={`/api/nhl/chart/${id}/${page}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open full-size chart ↗
      </a>
      <details className="publication-analysis">
        <summary>Full chart data, sources & gaps</summary>
        {failed ? (
          <p role="status">
            Chart source details could not load.{" "}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Retry sources
            </button>
          </p>
        ) : !data ? (
          <p role="status">Loading source snapshot…</p>
        ) : (
          <>
            <p>
              Data collected {nhlStamp(data.collected_at)}. Frozen research
              snapshot; current lineups may differ. Goals exclude shootout
              deciders. A missing field or appearance is unavailable, not zero.
            </p>
            {data.teams.map((t) => (
              <section key={t.abbreviation}>
                <h3>{t.name}</h3>
                <p>
                  {t.games.length} prior team games; {t.chart_boxes_verified}{" "}
                  source-matched boxes. Goalie:{" "}
                  {t.goalie?.name || "unavailable"} (
                  {t.goalie?.status || "unknown"}). PP1 is projected.
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Date</th>
                        <th>SOG</th>
                        <th>G</th>
                        <th>P</th>
                        <th>Blocks</th>
                        <th>TOI min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.samples
                        .filter((s) => s.seconds > 0)
                        .map((s) => (
                          <tr key={`${s.id}:${s.game_id}`}>
                            <td>{s.name}</td>
                            <td>{s.date}</td>
                            <td>{s.shots ?? "—"}</td>
                            <td>{s.goals ?? "—"}</td>
                            <td>{s.points ?? "—"}</td>
                            <td>{s.blocks ?? "—"}</td>
                            <td>{(s.seconds / 60).toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
            <h3>Coverage gaps</h3>
            <ul>
              {data.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            <h3>Exact sources</h3>
            <ul>
              {data.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.url}
                  </a>
                  <small style={{ display: "block", overflowWrap: "anywhere" }}>
                    Retrieved {nhlStamp(s.retrieved_at)} · SHA256 {s.sha256}
                  </small>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}
