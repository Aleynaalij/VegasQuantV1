"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { NewSport, SportPage } from "@/lib/sport-contract";
import { BEST_MAX_AGE_MS, type QuoteRow } from "@/lib/best-price";
import { slateGame, sportInjuries } from "@/lib/sport-page";
import { easternTime } from "@/lib/sport-slate";
import { SPORTS } from "@/lib/sports";
import { Shell } from "../ui";
import SportLogo from "./sport-logo";
import SportMarkets from "./sport-markets";

const RESULT: Record<string, string> = {
  AWAITING_FINAL: "Awaiting the final",
  CONFIRMING: "Final being confirmed",
  FINAL: "Final confirmed",
  CONFLICT: "Sources disagree; not graded",
  NO_RESULT: "No result (postponed or cancelled)",
};

/** One NHL or college basketball game from sports_game: matchup, markets, injuries, result. */
export default function SportGame({
  sport,
  slug,
}: {
  sport: NewSport;
  slug: string;
}) {
  const [page, setPage] = useState<SportPage | null>(null),
    [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [retry, setRetry] = useState(0),
    [books, setBooks] = useState<QuoteRow[]>([]);
  useEffect(() => {
    let live = true,
      generation = 0;
    async function load() {
      const n = ++generation;
      const r = await supabase.rpc("sports_game", {
        p_sport: sport,
        p_slug: slug,
      });
      if (!live || n !== generation) return;
      if (r.error || r.data?.version !== 1 || r.data.sport !== sport) {
        setState("error");
        return;
      }
      setPage(r.data as SportPage);
      setState("ready");
      // Other books' last-hour quotes name a better price (members only, by RLS). A failed read
      // only hides "Best"; FanDuel's markets still show.
      const id = (r.data as SportPage).games[0]?.id;
      const b = id
        ? await supabase
            .from("sports_book_quotes")
            .select("game_id,observed_at,payload")
            .eq("game_id", id)
            .gte(
              "observed_at",
              new Date(Date.now() - BEST_MAX_AGE_MS).toISOString(),
            )
            .order("observed_at", { ascending: false })
            .limit(500)
        : null;
      if (!live || n !== generation) return;
      setBooks(b && !b.error ? ((b.data || []) as QuoteRow[]) : []);
    }
    void load();
    const timer = setInterval(load, 60000);
    const auth = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      live = false;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [sport, slug, retry]);
  const raw = page?.games[0];
  const g = raw ? slateGame(raw) : null;
  const result = raw ? page?.results.find((r) => r.game_id === raw.id) : null;
  const injuries = raw && page ? sportInjuries(page.facts, raw.id) : null;
  const info = SPORTS[sport];
  return (
    <Shell active="game" sport={sport}>
      <div className="sport-game">
        <Link className="sport-back" href={info.home}>
          ← {info.label} desk
        </Link>
        {state === "loading" ? (
          <p role="status" className="vq-slate-empty">
            Loading the matchup…
          </p>
        ) : state === "error" && !page ? (
          <p role="alert" className="vq-slate-empty">
            This matchup could not load.{" "}
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </p>
        ) : !g || !raw ? (
          <section className="sport-game-head">
            <h1>Matchup not found</h1>
            <p className="sport-empty">
              It may have been rescheduled.{" "}
              <Link href={info.home}>See this week’s games →</Link>
            </p>
          </section>
        ) : (
          <>
            <section className="sport-game-head home-brief vq-home">
              <div className="vq-hero">
                <div className="vq-hero-top">
                  <span className="vq-kicker">
                    <i aria-hidden="true" /> {info.name}
                  </span>
                  <span className="vq-chip">{info.label}</span>
                </div>
                <h1 className="vq-sr">
                  {raw.away.name} {g.neutral ? "vs" : "at"} {raw.home.name}
                </h1>
                <div className="vq-matchup">
                  {(["away", "home"] as const).map((side, i) => (
                    <span
                      key={side}
                      className="vq-team"
                      style={{ order: i * 2 }}
                    >
                      <SportLogo
                        sport={sport}
                        team={g[side].name}
                        abbreviation={g[side].abbreviation}
                        espnId={g[side].espnId}
                        size={64}
                      />
                      <b>{g[side].short}</b>
                      {raw[`${side}_score`] !== null ? (
                        <strong className="sport-score">
                          {raw[`${side}_score`]}
                        </strong>
                      ) : null}
                    </span>
                  ))}
                  <span
                    className="vq-at"
                    aria-hidden="true"
                    style={{ order: 1 }}
                  >
                    {g.neutral ? "vs" : "@"}
                  </span>
                </div>
                <div className="vq-hero-meta">
                  <span>
                    {raw.start_time_tbd
                      ? "Time TBD"
                      : `${easternTime(raw.start_time, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}
                    {raw.venue ? ` · ${raw.venue}` : ""}
                    {g.neutral ? " · Neutral site" : ""}
                  </span>
                  <span className="sport-status">
                    {result
                      ? RESULT[result.status]
                      : raw.completed
                        ? "Final"
                        : raw.status
                            .replace(/^STATUS_/, "")
                            .replace(/_/g, " ")
                            .toLowerCase()}
                  </span>
                </div>
              </div>
            </section>
            {page!.access ? (
              <SportMarkets page={page!} gameId={raw.id} books={books} />
            ) : (
              <p role="status" className="sport-empty">
                Sign in with research access to see this game’s markets and
                selections.
              </p>
            )}
            {page!.access && injuries ? (
              <section className="sport-injuries">
                <h2 className="sport-markets-title">Reported injuries</h2>
                {injuries.lines.length ? (
                  <ul>
                    {injuries.lines.map((l) => (
                      <li key={`${l.team}|${l.player}`}>
                        <span>
                          {l.player} <small>{l.team}</small>
                        </span>
                        <b>{l.status}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sport-empty">
                    No injuries reported by the source yet.
                  </p>
                )}
                {injuries.notes.map((n) => (
                  <p key={n} className="sport-settle">
                    {n}.
                  </p>
                ))}
              </section>
            ) : null}
            <p className="vq-prop-note">
              Schedule and scores: ESPN, retrieved{" "}
              {easternTime(raw.source.retrieved_at, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              ET.
            </p>
          </>
        )}
      </div>
    </Shell>
  );
}
