"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
import BrandMark from "./brand-mark";
import DownloadCard from "./download-card";
import { time } from "@/lib/domain";
type Leg = {
  name: string;
  market: string;
  matchup: string;
  result: string;
  actual: number | null;
  sources: string[];
};
type Report = {
  id: string;
  week_start: string;
  week_end: string;
  version: number;
  created_at: string;
  payload: {
    wins: number;
    losses: number;
    pushes: number;
    voids: number;
    pending: number;
    duplicates_removed: number;
    unresolved_publications: number;
    excluded_publications: number;
    legs: Leg[];
    scope: string;
  };
};
function dateLabel(s: string) {
  return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}
export default function WeeklyPerformance() {
  const [reports, setReports] = useState<Report[]>([]),
    [chosen, setChosen] = useState(""),
    [notice, setNotice] = useState("Loading weekly performance…");
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const n = ++epoch;
      const r = await supabase
        .from("weekly_performance_reports")
        .select("*")
        .order("week_end", { ascending: false })
        .order("version", { ascending: false })
        .limit(52);
      if (!live || n !== epoch) return;
      if (r.error) {
        setReports([]);
        setNotice(
          "Sign in to view weekly performance, or refresh if the report could not load.",
        );
        return;
      }
      setReports(r.data || []);
      setNotice(
        r.data?.length ? "" : "The first weekly recap is awaiting publication.",
      );
    }
    void load();
    const timer = setInterval(load, 60000);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setReports([]);
      setChosen("");
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, []);
  const unique = reports.filter(
    (r, i) => reports.findIndex((x) => x.week_end === r.week_end) === i,
  );
  const report = unique.find((r) => r.id === chosen) || unique[0];
  if (!report)
    return (
      <Panel title="Weekly performance">
        <p role="status">{notice}</p>
        <p>
          New recaps publish Tuesday mornings. Only sourced outcomes enter the
          hit rate.
        </p>
      </Panel>
    );
  const p = report.payload,
    settled = p.wins + p.losses;
  const title = `Lessons Learned · ${dateLabel(report.week_start)}–${dateLabel(new Date(Date.parse(report.week_end + "T12:00:00Z") - 86400000).toISOString().slice(0, 10))}`;
  const sections = [
    { label: "Hits", result: "WIN", symbol: "✓" },
    { label: "Misses", result: "LOSS", symbol: "✕" },
    { label: "Pushes / voids", result: "OTHER", symbol: "—" },
    { label: "Pending verification", result: "PENDING", symbol: "…" },
  ];
  const cardGroups = sections.map((s) => {
    const legs = p.legs.filter((l) =>
      s.result === "OTHER"
        ? ["PUSH", "VOID"].includes(l.result)
        : l.result === s.result,
    );
    if (!legs.length && s.result !== "WIN" && s.result !== "LOSS") return [];
    return Array.from(
      { length: Math.max(1, Math.ceil(legs.length / 6)) },
      (_, i) => ({ ...s, page: i + 1, legs: legs.slice(i * 6, i * 6 + 6) }),
    );
  });
  const cards = Array.from(
    { length: Math.max(...cardGroups.map((g) => g.length)) },
    (_, i) => cardGroups.flatMap((g) => (g[i] ? [g[i]] : [])),
  ).flat();
  const coverage = `${p.pending} bound targets pending · ${p.unresolved_publications} publications with unresolved game identity excluded · ${p.excluded_publications} watchlist/ticket/unclassified publications excluded · ${p.duplicates_removed} duplicates removed.`;
  return (
    <Panel title="Weekly platform performance">
      <label>
        Past weeks
        <select value={report.id} onChange={(e) => setChosen(e.target.value)}>
          {unique.map((r) => (
            <option key={r.id} value={r.id}>
              {dateLabel(r.week_start)} · v{r.version}
            </option>
          ))}
        </select>
      </label>
      <h3>{title}</h3>
      <p>
        Published {time(report.created_at)} · Snapshot v{report.version}
      </p>
      {(p.pending > 0 || p.unresolved_publications > 0) && (
        <p role="status">
          <strong>Incomplete audit:</strong> {p.pending} targets pending and{" "}
          {p.unresolved_publications} publications with unresolved game
          identity. The verified-subset rate is not a complete platform hit
          rate.
        </p>
      )}
      <div className="filter-bar">
        <strong>{p.wins} hits</strong>
        <strong>{p.losses} misses</strong>
        <span>
          {p.pushes} pushes · {p.voids} voids
        </span>
        <span>
          {settled
            ? `${((100 * p.wins) / settled).toFixed(1)}% verified-subset hit rate (${p.wins}/${settled})`
            : "Hit rate unavailable: no verified wins/losses"}
        </span>
      </div>
      <p>
        Individual selections, counted once. Pushes, voids, pending and
        unresolved entries stay outside the hit-rate denominator. This is not a
        parlay win rate or ROI.
      </p>
      <div
        tabIndex={0}
        className="weekly-card-strip"
        aria-label="Swipe through weekly hits and misses"
      >
        {cards.map((c) => (
          <article
            className={`weekly-flashcard ${c.result === "LOSS" ? "weekly-misses" : ""}`}
            key={`${c.result}:${c.page}`}
          >
            <header>
              <BrandMark /> VEGAS QUANT · THE RECORD
            </header>
            <p className="eyebrow">
              {c.label} · Card {c.page}
            </p>
            <h3>{c.label}</h3>
            {c.legs.length ? (
              <ol>
                {c.legs.map((l, i) => (
                  <li key={i}>
                    <strong>
                      {c.symbol} {l.name}
                    </strong>
                    <span>{l.market}</span>
                    <small>{l.matchup}</small>
                    <span>
                      {l.actual == null
                        ? "Final total unavailable"
                        : `Verified final: ${l.actual}`}{" "}
                      · {l.result}
                    </span>
                    {l.sources[0] && (
                      <a
                        href={l.sources[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Result source ↗
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No verified {c.label.toLowerCase()} in this snapshot.</p>
            )}
            <footer>VegasQuant · Learn from the process.</footer>
          </article>
        ))}
      </div>
      <p>Swipe to see every card →</p>
      <details>
        <summary>Coverage and counting rules</summary>
        <p>{coverage}</p>
        <p>{p.scope}</p>
        <p>
          Snapshot results retain their original publication time. Later
          verification creates a new version; earlier reports remain in the
          audit.
        </p>
      </details>
      <DownloadCard
        title={title}
        subtitle="Weekly platform audit · Individual selections"
        publishedAt={report.created_at}
        sections={[
          {
            heading: "Performance",
            text: `${p.wins} hits · ${p.losses} misses · ${p.pushes} pushes · ${p.voids} voids. ${settled ? `${((100 * p.wins) / settled).toFixed(1)}% (${p.wins}/${settled})` : "No verified hit rate"}. Not a parlay win rate or ROI.`,
          },
          ...cards.map((c) => ({
            heading: `${c.label} · Card ${c.page}`,
            text:
              c.legs
                .map(
                  (l) =>
                    `${c.symbol} ${l.name} | ${l.market} | ${l.actual == null ? "Final unknown" : l.actual} · ${l.result}`,
                )
                .join("\n") || "None verified.",
          })),
          { heading: "Transparency", text: coverage + " " + p.scope },
        ]}
      />
    </Panel>
  );
}
