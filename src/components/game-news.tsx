"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
import {
  footballNews,
  memberResearchText,
  type GameNewsRow,
} from "@/lib/game-research";
export default function GameNews({
  gameId,
  before,
}: {
  gameId: string;
  before?: string;
}) {
  const [rows, setRows] = useState<GameNewsRow[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true,
      generation = 0;
    setRows([]);
    setLoading(true);
    setError(false);
    async function load() {
      const n = ++generation;
      let query = supabase
        .from("research_feed_posts")
        .select(
          "id,title,summary,why_watch,caution,source_url,source_at,created_at",
        )
        .eq("game_id", gameId)
        .gte(
          "created_at",
          new Date(
            Date.parse(before || new Date().toISOString()) - 7 * 86400000,
          ).toISOString(),
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (before) query = query.lte("created_at", before);
      const r = await query.abortSignal(AbortSignal.timeout(15000));
      if (!live || n !== generation) return;
      setError(!!r.error);
      if (!r.error) setRows(footballNews(r.data || []));
      setLoading(false);
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      generation++;
      clearInterval(timer);
    };
  }, [gameId, before]);
  return (
    <section className="game-week-news" aria-label="This week's game news">
      <h2>This week's game news</h2>
      {loading && <p role="status">Loading published news…</p>}
      {error && (
        <p role="alert">
          Game news could not refresh. Any retained stories may be older.
        </p>
      )}
      {!loading && !error && !rows.length && (
        <p>No game-specific news has been published yet.</p>
      )}
      {rows.map((row, index) => (
        <article className="game-news-card" key={row.id}>
          <small>
            {index === 0 ? "LATEST UPDATE · " : "EARLIER UPDATE · "}
            {time(row.created_at)}
          </small>
          <h3>{row.title}</h3>
          <p>{memberResearchText(row.summary)}</p>
          <details>
            <summary>Why it matters & sources</summary>
            {memberResearchText(row.why_watch) && (
              <p>{memberResearchText(row.why_watch)}</p>
            )}
            {memberResearchText(row.caution) && (
              <p className="muted">{memberResearchText(row.caution)}</p>
            )}
            <a href={row.source_url} target="_blank" rel="noopener noreferrer">
              Read the source ↗
            </a>
            <small>Source observed {time(row.source_at)}</small>
          </details>
        </article>
      ))}
    </section>
  );
}
