"use client";
import "./nhl-chart-preview.css";
import { useEffect, useRef, useState } from "react";
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
  const touch = useRef<number | null>(null);
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
      aria-label="NHL research chart pages"
      onTouchStart={(e) => {
        touch.current = (e.target as HTMLElement).closest(
          "details,nav,a,button",
        )
          ? null
          : (e.touches[0]?.clientX ?? null);
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start !== null && end !== undefined && Math.abs(end - start) > 60)
          setPage((p) => Math.max(1, Math.min(3, p + (end < start ? 1 : -1))));
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
          {["Matchup", "Player volume", "Blocks & roles"][page - 1]} · {page} /
          3 · Swipe
        </span>
        <button
          type="button"
          disabled={page === 3}
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
          alt: `NHL ${["matchup", "player volume", "blocked shots and roles"][page - 1]} research chart. Full data and sources below.`,
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
              snapshot; current lineups may differ.
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
