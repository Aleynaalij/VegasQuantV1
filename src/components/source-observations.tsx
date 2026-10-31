"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { odd, time } from "@/lib/domain";
import {
  beats,
  BEST_MAX_AGE_MS,
  bookQuotes,
  BOOKS,
  selectionKey,
  type QuoteRow,
} from "@/lib/best-price";
import { SourceLink } from "./ui";
type Observation = {
  id: string;
  kind: string;
  provider: string;
  source: string;
  observed_at: string | null;
  recorded_at: string;
  payload?: Record<string, unknown>;
};
const markets: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
};
export default function SourceObservations({
  gameId,
  before,
}: {
  gameId: string;
  before?: string;
}) {
  const [quotes, setQuotes] = useState<Observation[]>([]),
    [rows, setRows] = useState<Observation[]>([]),
    [books, setBooks] = useState<QuoteRow[]>([]),
    [clock, setClock] = useState(() => Date.now()),
    [error, setError] = useState(""),
    [rawOpen, setRawOpen] = useState(false);
  useEffect(() => {
    let live = true,
      generation = 0;
    setQuotes([]);
    setError("");
    async function load() {
      const n = ++generation;
      // Other books' game lines, last hour only, to name a better price. Not on a past snapshot
      // (`before`): "Best" is about prices available now.
      const others = before
        ? Promise.resolve({ data: [] as QuoteRow[], error: null })
        : supabase
            .from("source_observations")
            .select("game_id,observed_at,payload")
            .eq("game_id", gameId)
            .eq("kind", "odds")
            .in("payload->>book", [...BOOKS])
            .in("payload->>market", Object.keys(markets))
            .gte(
              "observed_at",
              new Date(Date.now() - BEST_MAX_AGE_MS).toISOString(),
            )
            .order("observed_at", { ascending: false })
            .limit(300)
            .abortSignal(AbortSignal.timeout(15000));
      const results = await Promise.all(
        Object.keys(markets).map(async (market) => {
          let query = supabase
            .from("source_observations")
            .select("id,kind,provider,source,observed_at,recorded_at,payload")
            .eq("game_id", gameId)
            .eq("kind", "odds")
            .eq("payload->>book", "FanDuel")
            .eq("payload->>market", market)
            .order("observed_at", { ascending: false, nullsFirst: false })
            .order("recorded_at", { ascending: false })
            .limit(1);
          if (before) query = query.lte("recorded_at", before);
          return query.abortSignal(AbortSignal.timeout(15000));
        }),
      );
      const other = await others;
      if (!live || n !== generation) return;
      // A failed comparison read only hides "Best"; FanDuel's board still shows.
      setBooks(other.error ? [] : ((other.data || []) as QuoteRow[]));
      setClock(Date.now());
      setError(
        results.some((r) => r.error)
          ? "Some sportsbook snapshots could not refresh."
          : "",
      );
      setQuotes(results.flatMap((r) => (r.error ? [] : r.data || [])));
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      generation++;
      clearInterval(timer);
    };
  }, [gameId, before]);
  useEffect(() => {
    if (!rawOpen) return;
    let live = true;
    setRows([]);
    let history = supabase
      .from("source_observations")
      .select("id,kind,provider,source,observed_at,recorded_at")
      .eq("game_id", gameId)
      .order("recorded_at", { ascending: false })
      .limit(18);
    if (before) history = history.lte("recorded_at", before);
    void history.abortSignal(AbortSignal.timeout(15000)).then((r) => {
      if (live) {
        setRows(r.data || []);
        if (r.error) setError("Source history could not load.");
      }
    });
    return () => {
      live = false;
    };
  }, [gameId, rawOpen, before]);
  const compare = bookQuotes(books, clock, BEST_MAX_AGE_MS);
  const groups = new Map<string, Observation[]>();
  for (const row of rows) {
    const key = row.kind + " · " + row.provider;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return (
    <details className="mi-section">
      <summary>Sportsbook board & source history</summary>
      <p className="muted">
        FanDuel game lines from stored provider snapshots. &ldquo;Best&rdquo;
        names another book (DraftKings, BetMGM, Caesars, BetRivers or
        Fanatics) paying more for the identical line in the last hour. Verify
        availability with the book. These are prices, not recommendations.
      </p>
      {error && <p role="alert">{error}</p>}
      {!quotes.length && !error && (
        <p>No FanDuel game-line snapshot is available.</p>
      )}
      {quotes.map((row) => (
        <article className="game-quote-card" key={row.id}>
          <h3>FanDuel · {markets[String(row.payload?.market)]}</h3>
          {Array.isArray(row.payload?.outcomes) &&
            row.payload.outcomes.map((outcome: unknown, i: number) => {
              if (!outcome || typeof outcome !== "object") return null;
              const o = outcome as Record<string, unknown>;
              if (
                typeof o.name !== "string" ||
                typeof o.price !== "number" ||
                !Number.isFinite(o.price) ||
                Math.abs(o.price) < 100
              )
                return null;
              const better = before
                ? null
                : beats(
                    compare,
                    selectionKey(
                      gameId,
                      String(row.payload?.market),
                      "",
                      o.name,
                      typeof o.point === "number" ? o.point : null,
                    ),
                    o.price,
                  );
              return (
                <p key={i}>
                  <strong>{o.name}</strong>
                  {typeof o.point === "number"
                    ? ` ${o.point > 0 && row.payload?.market === "spreads" ? "+" : ""}${o.point}`
                    : ""}{" "}
                  <b>{odd(o.price)}</b>
                  {better ? (
                    <small className="sport-best">
                      Best {odd(better.price)} · {better.book}
                    </small>
                  ) : null}
                </p>
              );
            })}
          <small>
            Observed {row.observed_at ? time(row.observed_at) : "time unknown"}{" "}
            · Retrieved {time(row.recorded_at)}
          </small>
          <p>
            <SourceLink href={row.source}>Price source ↗</SourceLink>
          </p>
        </article>
      ))}
      <details onToggle={(e) => setRawOpen(e.currentTarget.open)}>
        <summary>Technical source history</summary>
        {[...groups.entries()].map(([name, observations]) => (
          <details key={name}>
            <summary>
              {name} · {observations.length} recent observations
            </summary>
            {observations.map((row) => (
              <p key={row.id}>
                {row.observed_at
                  ? time(row.observed_at)
                  : "Provider time unknown"}{" "}
                · <SourceLink href={row.source}>Source ↗</SourceLink>
              </p>
            ))}
          </details>
        ))}
        <small>
          Latest 18 source records. Research and news are shown above.
        </small>
      </details>
    </details>
  );
}
