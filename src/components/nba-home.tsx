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
  currentSelections,
  playerLines,
  selectionLabel,
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
import SportSlate from "./sport/sport-slate";
import LiveNow from "./sport/live-now";

type Pick = {
  id: string;
  game_id: string;
  player: string;
  market: string;
  direction: string;
  line: number;
  odds: number;
  book: string;
  rationale: string;
  risk: string;
  quote_observed_at: string | null;
  expires_at: string;
  supersedes_id: string | null;
};

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
    [books, setBooks] = useState<QuoteRow[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(false),
    [opened, setOpened] = useState(false),
    // Raw quote rows; what shows is re-derived against the clock, so a stalled feed ages out.
    [rows, setRows] = useState<NbaQuoteRow[]>([]),
    [clock, setClock] = useState(() => Date.now()),
    [picks, setPicks] = useState<Pick[]>([]),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState(0),
    [copied, setCopied] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    async function load() {
      const at = Date.now();
      const r = await supabase
        .from("nba_games")
        .select(
          "id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,status",
        )
        .eq("season_type", 2)
        .gte("tipoff", new Date(at - 4 * 3600000).toISOString())
        .lte("tipoff", new Date(at + 7 * 86400000).toISOString())
        .order("tipoff")
        .order("id")
        .limit(120);
      if (!live) return;
      setError(!!r.error);
      if (!r.error)
        setGames(((r.data || []) as NbaSlateRow[]).map(nbaSlateGame));
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
        setRows([]);
        setPicks([]);
        setBooks([]);
        if (opened) setNotice("Sign in to see game markets.");
        return;
      }
      const list = ids.split(",");
      const [q, p, b] = await Promise.all([
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
        opened
          ? supabase
              .from("nba_editorial_picks")
              .select(
                "id,game_id,player,market,direction,line,odds,book,rationale,risk,quote_observed_at,expires_at,supersedes_id",
              )
              .in("game_id", list)
              .gt("expires_at", new Date().toISOString())
              .order("published_at", { ascending: false })
              .limit(200)
          : Promise.resolve({ data: [] as Pick[], error: null }),
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
      ]);
      if (!live || n !== generation) return;
      if (q.error || p.error) {
        if (opened) setNotice("Markets could not load. Please retry.");
        return;
      }
      setRows((q.data || []) as NbaQuoteRow[]);
      setPicks(currentSelections((p.data || []) as Pick[]));
      // A failed comparison read only hides "Best"; FanDuel prices still show.
      setBooks(b.error ? [] : ((b.data || []) as QuoteRow[]));
      setNotice("");
    }
    void load();
    const timer = setInterval(load, 60000);
    const auth = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      live = false;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
    // games is derived from ids; the effect keys on the id list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, opened]);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(tick);
  }, []);
  const faces: Record<string, MoneylineRead> = nbaFaces(rows, games, clock);
  const quotes = latestQuotes(rows, clock);
  const compare = bookQuotes(books, clock, BEST_MAX_AGE_MS);
  async function copy(gameId: string, rows: Pick[]) {
    const text = rows
      .map((p) => `${p.player} ${selectionLabel(p)} ${americanPrice(p.odds)}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied((c) => ({
        ...c,
        [gameId]: `Copied ${rows.length} selection${rows.length === 1 ? "" : "s"}.`,
      }));
    } catch {
      setCopied((c) => ({
        ...c,
        [gameId]: "Copy is unavailable in this browser.",
      }));
    }
  }
  return (
    <div className="nba-home sport-home">
      <SportBrief
        sport="nba"
        games={games}
        action="Choose player props"
        emptyTitle={loaded ? "No NBA games this week." : "Loading the slate."}
      />
      <LiveNow
        sport="nba"
        ours={games.map((g) => ({
          away: g.away.name,
          home: g.home.name,
          start: g.start,
          href: g.href,
        }))}
        picked={games
          .filter((g) => picks.some((p) => p.game_id === g.id))
          .map((g) => ({
            away: g.away.name,
            home: g.home.name,
            start: g.start,
          }))}
      />
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
          if (notice)
            return (
              <div className="sport-markets">
                <p role="status">{notice}</p>
                {open}
              </div>
            );
          const selections = picks.filter((p) => p.game_id === g.id);
          const lines = gameLines(quotes[g.id], g);
          const props = playerLines(quotes[g.id]);
          return (
            <div className="sport-markets">
              <h3 className="sport-markets-title">Vegas Quant selections</h3>
              {selections.length ? (
                <>
                  <ul className="sport-selections">
                    {selections.map((p) => (
                      <li key={p.id}>
                        <span>
                          <b>{p.player}</b>
                          <small>{selectionLabel(p)}</small>
                        </span>
                        <span className="sport-price">
                          {americanPrice(p.odds)}
                          <small>{p.book}</small>
                          <Best
                            q={beats(
                              compare,
                              selectionKey(
                                p.game_id,
                                p.market,
                                p.player,
                                p.direction,
                                p.line,
                              ),
                              p.odds,
                            )}
                          />
                        </span>
                        <details>
                          <summary>Why and the risk</summary>
                          <p>{p.rationale}</p>
                          <p>
                            <b>Risk:</b> {p.risk}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                  <div className="vq-prop-copy">
                    <button
                      type="button"
                      onClick={() => void copy(g.id, selections)}
                    >
                      Copy selections
                    </button>
                    {copied[g.id] ? (
                      <span role="status">{copied[g.id]}</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="sport-empty">
                  No published selections for this game yet.
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
