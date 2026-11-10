"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { americanPrice, type MoneylineRead } from "@/lib/home-props";
import {
  gameLines,
  latestQuotes,
  NBA_QUOTE_MAX_AGE_MS,
  nbaFaces,
  nbaSlateGame,
  playerLines,
  type NbaQuoteRow,
  type NbaSlateRow,
} from "@/lib/nba-slate";
import {
  beats,
  BEST_MAX_AGE_MS,
  bookQuotes,
  BOOKS,
  selectionKey,
  type BookQuote,
  type QuoteRow,
} from "@/lib/best-price";
import { easternTime, type SlateGame } from "@/lib/sport-slate";
import SportBrief from "./sport/sport-brief";
import NbaLineups, { NbaAvailabilitySummary } from "./nba-lineups";
import SportSlate from "./sport/sport-slate";
import LiveNow from "./sport/live-now";
import { NbaGameDetails } from "./nba-game-board";
import NbaGameSelections from "./nba-game-selections";
import type { NbaGame } from "@/lib/nba-board";

const price = (p: number | null | undefined) =>
  p === null || p === undefined ? "–" : americanPrice(p);
const signed = (n: number | undefined) =>
  n === undefined ? "" : n > 0 ? `+${n}` : `${n}`;
/** Another book paying more for the identical line; nothing when FanDuel is already best. */
const Best = ({ q }: { q: BookQuote | null }) =>
  q ? (
    <small className="sport-best">
      Best {americanPrice(q.price)} · {q.book}
    </small>
  ) : null;

/** NBA Home in the NFL layout: the next tip-off, then the week's games with their markets inside. */
export default function NbaHome() {
  const [games, setGames] = useState<SlateGame[]>([]),
    [researchGames, setResearchGames] = useState<NbaGame[]>([]),
    [researchAllowed, setResearchAllowed] = useState(false),
    [accountVersion, setAccountVersion] = useState(0),
    [books, setBooks] = useState<QuoteRow[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [opened, setOpened] = useState(false),
    // Raw quote rows; what shows is re-derived against the clock, so a stalled feed ages out.
    [rows, setRows] = useState<NbaQuoteRow[]>([]),
    [clock, setClock] = useState(() => Date.now()),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    async function load() {
      const at = Date.now();
      const r = await supabase
        .from("nba_games")
        .select(
          "id,provider_id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,status,season,season_type,away_score,home_score,source,updated_at",
        )
        .eq("season_type", 2)
        .gte("tipoff", new Date(at - 4 * 3600000).toISOString())
        .lte("tipoff", new Date(at + 7 * 86400000).toISOString())
        .order("tipoff")
        .order("id")
        .limit(120);
      if (!live) return;
      setError(!!r.error);
      if (!r.error) {
        setGames(((r.data || []) as NbaSlateRow[]).map(nbaSlateGame));
        setResearchGames((r.data || []) as NbaGame[]);
      }
      setLoaded(true);
    }
    void load();
    const timer = setInterval(load, 5 * 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [retry]);
  const ids = games
    .map((g) => g.id)
    .sort()
    .join(",");
  // FanDuel quotes are member reads, like NFL's: faces always, markets once a game opens.
  useEffect(() => {
    if (!ids) return;
    let live = true,
      generation = 0;
    async function load() {
      const n = ++generation;
      const session = await supabase.auth.getSession();
      if (!live || n !== generation) return;
      if (!session.data.session) {
        setResearchAllowed(false);
        setRows([]);
        setBooks([]);
        if (opened) setNotice("Sign in to see game markets.");
        return;
      }
      const list = ids.split(",");
      const [q, b, access] = await Promise.all([
        supabase
          .from("nba_observations")
          .select("game_id,kind,observed_at,recorded_at,payload")
          .in("game_id", list)
          .in("kind", opened ? ["odds", "prop"] : ["odds"])
          .eq("payload->>book", "FanDuel")
          .gte(
            "observed_at",
            new Date(Date.now() - NBA_QUOTE_MAX_AGE_MS).toISOString(),
          )
          .order("observed_at", { ascending: false })
          .limit(opened ? 2000 : 400),
        // Every book's quotes, read only once a game opens, to name the best price for each line.
        opened
          ? supabase
              .from("nba_observations")
              .select("game_id,observed_at,payload")
              .in("game_id", list)
              .in("kind", ["odds", "prop"])
              .in("payload->>book", [...BOOKS])
              .gte(
                "observed_at",
                new Date(Date.now() - BEST_MAX_AGE_MS).toISOString(),
              )
              .order("observed_at", { ascending: false })
              .limit(8000)
          : Promise.resolve({ data: [] as QuoteRow[], error: null }),
        supabase.rpc("membership_status"),
      ]);
      if (!live || n !== generation) return;
      setResearchAllowed(!access.error && access.data?.allowed === true);
      setRows(q.error ? [] : ((q.data || []) as NbaQuoteRow[]));
      // A failed comparison read only hides "Best"; FanDuel prices still show.
      setBooks(b.error ? [] : ((b.data || []) as QuoteRow[]));
      setNotice(
        q.error
          ? "Some markets or selections could not load. Please retry."
          : "",
      );
    }
    void load();
    const timer = setInterval(load, 60000);
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    window.addEventListener("focus", refresh);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++generation;
      setResearchAllowed(false);
      setAccountVersion((n) => n + 1);
      setRows([]);
      setBooks([]);
      setTimeout(refresh, 0);
    });
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      auth.data.subscription.unsubscribe();
    };
    // games is derived from ids; the effect keys on the id list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, opened, retry]);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(tick);
  }, []);
  const faces: Record<string, MoneylineRead> = nbaFaces(rows, games, clock);
  const quotes = latestQuotes(rows, clock);
  const compare = bookQuotes(books, clock, BEST_MAX_AGE_MS);
  return (
    <div className="nba-home sport-home">
      <SportBrief
        sport="nba"
        games={games}
        action="Choose player props"
        emptyTitle={loaded ? "No NBA games this week." : "Loading the slate."}
      />
      <LiveNow sport="nba" />
      {error ? (
        <p role="status" className="vq-slate-empty">
          The NBA schedule could not load.{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      <SportSlate
        games={games}
        summaryExtra={(g) => (
          <NbaAvailabilitySummary
            game={{
              away: g.away.abbreviation,
              home: g.home.abbreviation,
              start: g.start,
              tbd: g.tbd,
            }}
          />
        )}
        faces={faces}
        onOpen={() => setOpened(true)}
        empty={loaded ? "No NBA games scheduled this week." : "Loading games…"}
      >
        {(g) => {
          const open = g.href ? (
            <Link className="vq-btn ghost sport-open" href={g.href}>
              Open the matchup →
            </Link>
          ) : null;
          const researchGame = researchGames.find((r) => r.id === g.id);
          if (notice.startsWith("Sign in"))
            return (
              <div className="sport-markets">
                {researchGame && (
                  <NbaGameSelections
                    key={`selections-${researchGame.id}-${accountVersion}`}
                    game={researchGame}
                    allowed={researchAllowed}
                    now={clock}
                  />
                )}
                <NbaLineups
                  game={{
                    away: g.away.abbreviation,
                    home: g.home.abbreviation,
                    start: g.start,
                    tbd: g.tbd,
                  }}
                />
                <p role="status">{notice}</p>
                {open}
              </div>
            );
          const lines = gameLines(quotes[g.id], g);
          const props = playerLines(quotes[g.id]);
          return (
            <div className="sport-markets">
              {researchGame && (
                <NbaGameSelections
                  key={`selections-${researchGame.id}-${accountVersion}`}
                  game={researchGame}
                  allowed={researchAllowed}
                  now={clock}
                />
              )}
              <NbaLineups
                game={{
                  away: g.away.abbreviation,
                  home: g.home.abbreviation,
                  start: g.start,
                  tbd: g.tbd,
                }}
              />
              {notice && (
                <p role="status">
                  {notice}{" "}
                  <button type="button" onClick={() => setRetry((n) => n + 1)}>
                    Retry markets and selections
                  </button>
                </p>
              )}
              {researchGame && researchAllowed ? (
                <NbaGameDetails
                  key={`${researchGame.id}-${accountVersion}`}
                  game={researchGame}
                  now={clock}
                  defaultOpen
                  showLineups={false}
                />
              ) : (
                <p role="status">
                  Game source research requires verified research access.{" "}
                  <Link href="/membership">Check account access →</Link>
                </p>
              )}
              <h3 className="sport-markets-title">FanDuel lines</h3>
              {lines.spread.length || lines.total.length ? (
                <div className="sport-lines">
                  {lines.spread.map((l) => (
                    <span key={`s-${l.label}`}>
                      <small>Spread</small>
                      {l.label} {signed(l.point)} <b>{price(l.price)}</b>
                      <Best
                        q={beats(
                          compare,
                          selectionKey(
                            g.id,
                            "spreads",
                            "",
                            l.name,
                            l.point ?? null,
                          ),
                          l.price,
                        )}
                      />
                    </span>
                  ))}
                  {lines.total.map((l) => (
                    <span key={`t-${l.label}`}>
                      <small>Total</small>
                      {l.label} {l.point} <b>{price(l.price)}</b>
                      <Best
                        q={beats(
                          compare,
                          selectionKey(
                            g.id,
                            "totals",
                            "",
                            l.name,
                            l.point ?? null,
                          ),
                          l.price,
                        )}
                      />
                    </span>
                  ))}
                </div>
              ) : (
                <p className="sport-empty">No FanDuel game lines yet.</p>
              )}
              {props.length ? (
                <details className="sport-props">
                  <summary>
                    FanDuel player points & rebounds · {props.length}
                  </summary>
                  <ul>
                    {props.map((l) => (
                      <li key={`${l.player}|${l.stat}|${l.point}`}>
                        <span>
                          {l.player} <small>{l.stat}</small>
                        </span>
                        <span>{l.point}</span>
                        {(["Over", "Under"] as const).map((side) => {
                          const shown = side === "Over" ? l.over : l.under;
                          const market =
                            l.stat === "PTS"
                              ? "player_points"
                              : "player_rebounds";
                          return (
                            <span key={side}>
                              {side[0]} {price(shown)}
                              <Best
                                q={beats(
                                  compare,
                                  selectionKey(
                                    g.id,
                                    market,
                                    l.player,
                                    side,
                                    l.point,
                                  ),
                                  shown,
                                )}
                              />
                            </span>
                          );
                        })}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <p className="vq-prop-note">
                {lines.quotedAt
                  ? `FanDuel quotes as of ${easternTime(lines.quotedAt, { hour: "numeric", minute: "2-digit" })} ET. `
                  : ""}
                &ldquo;Best&rdquo; is the highest price for the identical line
                across FanDuel, DraftKings, BetMGM, Caesars, BetRivers and
                Fanatics in the last hour. Prices move and are not guaranteed.
                Market lines are reference, not selections.
              </p>
              {open}
            </div>
          );
        }}
      </SportSlate>
      <Link className="sport-research-link" href="/nba/analysis">
        NBA research · season trends, injuries and lines →
      </Link>
    </div>
  );
}
