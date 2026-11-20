"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Flame,
  Lock,
  Radio,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { Game } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import { SPORTS, liveSports, type Sport } from "@/lib/sports";
import { useTonightSchedules } from "@/lib/use-tonight-schedules";
import { startLabel } from "@/lib/vq-tonight";
import { isLiveSport, type LiveGame, type LiveSport } from "@/lib/live-scores";
import { loadSlate } from "@/lib/nba-tonight";
import { buildPropRows, type PropRow } from "@/lib/nba-props";
import { nbaWhen } from "@/lib/nba-home";
import {
  board,
  edgeSide,
  greeting,
  headline,
  heat,
  hotStreaks,
  odds,
  tally,
  tickerItems,
  topEdges,
  type BoardRow,
} from "@/lib/home3";
import SectionBoundary from "@/components/section-boundary";
import HomeDealer from "@/components/home2/home-dealer";
import "./home3.css";

export type Home3Props = {
  nflGames: Game[];
  nflUnavailable?: boolean;
  zoneHref?: string;
};

const SHORT = { player_points: "PTS", player_rebounds: "REB" } as const;
const time = (iso: string) =>
  nbaWhen(iso, { hour: "numeric", minute: "2-digit" });

/** The server's desk read can fail on a cold start; the browser retries it once with the session. */
function useNflGames(initial: Game[], unavailable: boolean) {
  const [games, setGames] = useState(initial);
  const [failed, setFailed] = useState(unavailable);
  useEffect(() => {
    if (!unavailable) return;
    let active = true;
    void (async () => {
      try {
        const r = await supabase.rpc("desk_data");
        const list = (r.data as { games?: Game[] } | null)?.games;
        if (!active) return;
        if (r.error || !Array.isArray(list)) return;
        setGames(list);
        setFailed(false);
      } catch {
        /* keep the notice; schedules for other sports still load */
      }
    })();
    return () => {
      active = false;
    };
  }, [unavailable]);
  return { games, failed };
}

/** Live scores for every live sport, refreshed every 45s while the page is visible. */
function useLiveScores() {
  const [live, setLive] = useState<Partial<Record<LiveSport, LiveGame[]>>>({});
  useEffect(() => {
    let active = true;
    const sports = liveSports().filter(isLiveSport);
    const read = async () => {
      if (document.visibilityState === "hidden") return;
      const results = await Promise.all(
        sports.map(async (s) => {
          try {
            const r = await fetch(`/api/live?sport=${s}`, {
              cache: "no-store",
            });
            const body = r.ok ? await r.json() : null;
            return [s, Array.isArray(body?.games) ? body.games : []] as const;
          } catch {
            return [s, null] as const;
          }
        }),
      );
      if (!active) return;
      setLive((prev) => {
        const next = { ...prev };
        for (const [s, games] of results) if (games) next[s] = games;
        return next;
      });
    };
    void read();
    const timer = setInterval(read, 45000);
    document.addEventListener("visibilitychange", read);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);
  return live;
}

export type Edges = {
  state: "loading" | "ready" | "error";
  member: boolean;
  rows: PropRow[];
};
/** Tonight's NBA prop rows, the same reads and math as Prop Finder. */
function useEdges() {
  const [edges, setEdges] = useState<Edges>({
    state: "loading",
    member: false,
    rows: [],
  });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const a = await supabase.rpc("membership_status");
        const member = !a.error && a.data?.allowed === true;
        const slate = await loadSlate(member);
        if (active)
          setEdges({
            state: "ready",
            member,
            rows: buildPropRows(slate, Date.now()),
          });
      } catch {
        if (active) setEdges({ state: "error", member: false, rows: [] });
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return edges;
}

/** A first name for the greeting: the member's Zone username, else nothing. */
function useName() {
  const [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const p = await supabase
          .from("community_profiles")
          .select("username")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (active && !p.error && p.data?.username) setName(p.data.username);
      } catch {
        /* greeting without a name */
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return name;
}

function Face({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span className="h3-face" aria-hidden="true">
      {failed ? (
        <span>{initials}</span>
      ) : (
        <img
          src={`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`}
          alt=""
          width={64}
          height={47}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function Strip({ r, over }: { r: PropRow; over: boolean }) {
  const last = r.games.slice(0, 10).reverse();
  return (
    <span className="h3-strip" aria-hidden="true">
      {last.map((g, i) => (
        <i key={i} className={g.over === over ? "hit" : "miss"} />
      ))}
    </span>
  );
}

function opponentLine(r: PropRow) {
  const team =
    (r.home ? r.game.home_abbreviation : r.game.away_abbreviation) ||
    r.player.team.slice(0, 3).toUpperCase();
  return `${team} ${r.home ? "vs" : "@"} ${r.opponent} · ${time(r.game.tipoff)}`;
}

function EdgeCard({ r, rank }: { r: PropRow; rank: number }) {
  const s = edgeSide(r);
  const h = heat(s.edge);
  return (
    <Link
      className={`h3-edge heat-${h}`}
      href={`/nba/props?q=${encodeURIComponent(r.trend.player)}`}
    >
      <span className="h3-rank">#{rank}</span>
      <div className="h3-edge-head">
        <Face id={r.player.athlete_id} name={r.trend.player} />
        <span>
          <b>{r.trend.player}</b>
          <small>{opponentLine(r)}</small>
        </span>
      </div>
      <div className="h3-pick">
        <span className={s.over ? "h3-o" : "h3-u"}>
          {s.over ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {s.over ? "Over" : "Under"}
        </span>
        <b>{r.trend.line}</b>
        <span>{SHORT[r.trend.market]}</span>
        <em>{odds(s.price)}</em>
      </div>
      <div className="h3-edge-nums">
        <span className="h3-edge-pill">
          +{s.edge} <small>edge</small>
        </span>
        {s.chance != null && (
          <span className="h3-chance">
            {s.chance}% <small>our est.</small>
          </span>
        )}
      </div>
      <div className="h3-form">
        <Strip r={r} over={s.over} />
        {s.hits != null && (
          <small>
            {s.hits}/{s.n} last {s.n}
          </small>
        )}
      </div>
      {s.best && (
        <div className="h3-best">
          Best price · {s.best.book} {odds(s.best.price)}
        </div>
      )}
    </Link>
  );
}

function EdgeRail({ edges, now }: { edges: Edges; now: number }) {
  const top = useMemo(() => topEdges(edges.rows, now), [edges.rows, now]);
  const total = edges.rows.length;
  return (
    <section className="h3-section" aria-labelledby="h3-edges-title">
      <div className="h3-heading">
        <div>
          <span className="h3-eyebrow">
            <Sparkles size={13} /> NBA · tonight
          </span>
          <h2 id="h3-edges-title">Best edges on the board</h2>
        </div>
        <Link href="/nba/props">
          {total ? `All ${total} props` : "Prop Finder"}{" "}
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {edges.state === "loading" && (
        <div className="h3-rail" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h3-edge h3-skeleton" />
          ))}
        </div>
      )}
      {edges.state === "error" && (
        <p className="h3-quiet">
          Props didn&rsquo;t load.{" "}
          <Link href="/nba/props">Open Prop Finder</Link>
        </p>
      )}
      {edges.state === "ready" && !edges.member && (
        <Link className="h3-locked" href="/membership">
          <Lock size={18} />
          <span>
            <b>Tonight&rsquo;s edges are for members</b>
            <small>
              Our estimate vs the book&rsquo;s no-vig price, the best price
              across books and every hit rate.
            </small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
      )}
      {edges.state === "ready" && edges.member && !top.length && (
        <p className="h3-quiet">
          No edges yet: lines post closer to tip.{" "}
          <Link href="/nba/props">See every prop</Link>
        </p>
      )}
      {top.length > 0 && (
        <div className="h3-rail">
          {top.map((r, i) => (
            <EdgeCard key={r.key} r={r} rank={i + 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function Headliner({ edges, now }: { edges: Edges; now: number }) {
  const r = useMemo(() => topEdges(edges.rows, now, 1)[0], [edges.rows, now]);
  const story = r ? headline(r) : null;
  if (!r || !story) return null;
  const s = edgeSide(r);
  return (
    <Link
      className="h3-headliner"
      href={`/nba/props?q=${encodeURIComponent(r.trend.player)}`}
    >
      <span className="h3-eyebrow">
        <Sparkles size={13} /> Tonight&rsquo;s headliner
      </span>
      <div className="h3-hl-body">
        <Face id={r.player.athlete_id} name={r.trend.player} />
        <div>
          <b>
            {r.trend.player} {s.over ? "over" : "under"} {r.trend.line}{" "}
            {SHORT[r.trend.market]}
          </b>
          <small>{opponentLine(r)}</small>
        </div>
        <span className="h3-edge-pill">
          +{story.edge} <small>edge</small>
        </span>
      </div>
      <p>
        {story.form} {story.case}
      </p>
    </Link>
  );
}

function StreakRail({ rows, now }: { rows: PropRow[]; now: number }) {
  const hot = useMemo(() => hotStreaks(rows, now), [rows, now]);
  if (!hot.length) return null;
  return (
    <section className="h3-section" aria-labelledby="h3-fire-title">
      <div className="h3-heading">
        <div>
          <span className="h3-eyebrow">
            <Flame size={13} /> Active streaks
          </span>
          <h2 id="h3-fire-title">On fire</h2>
        </div>
      </div>
      <div className="h3-fire">
        {hot.map((r) => {
          const over = r.streak > 0;
          return (
            <Link
              key={r.key}
              href={`/nba/props?q=${encodeURIComponent(r.trend.player)}`}
              className={over ? "over" : "under"}
            >
              <span className="h3-flame" aria-hidden="true">
                <Flame size={16} />
                {Math.abs(r.streak)}
              </span>
              <span>
                <b>{r.trend.player}</b>
                <small>
                  {Math.abs(r.streak)} straight {over ? "overs" : "unders"} ·{" "}
                  {SHORT[r.trend.market]} {r.trend.line}
                </small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function score(g: BoardRow, side: "away" | "home") {
  const s = g.live?.[side]?.score;
  return g.phase === "upcoming" || s == null ? null : s;
}

function Ticker({ rows }: { rows: BoardRow[] }) {
  const items = tickerItems(rows);
  if (!items.length) return null;
  return (
    <nav className="h3-ticker" aria-label="Live and next games">
      {items.map((g) => (
        <Link
          key={`${g.sport}:${g.id}`}
          href={g.href}
          className={g.phase === "live" ? "live" : ""}
        >
          <span className="h3-tick-top">
            <span>{SPORTS[g.sport].label}</span>
            {g.phase === "live" ? (
              <span className="h3-live">
                <i aria-hidden="true" /> {g.live?.detail || "Live"}
              </span>
            ) : (
              <span>{startLabel(g)}</span>
            )}
          </span>
          <span className="h3-tick-team">
            <b>{g.live?.away.abbreviation || g.away}</b>
            <em>{score(g, "away") ?? ""}</em>
          </span>
          <span className="h3-tick-team">
            <b>{g.live?.home.abbreviation || g.home}</b>
            <em>{score(g, "home") ?? ""}</em>
          </span>
        </Link>
      ))}
    </nav>
  );
}

const PILLS = [
  { href: "/nba/props", label: "Prop Finder", hot: true },
  { href: "/community", label: "The Zone" },
  { href: "/parlays", label: "My Lays" },
  { href: "/parlays?build=1", label: "Build a Lay" },
  { href: "/saved", label: "Saved picks" },
  { href: "/nba/records", label: "Records" },
  { href: "/vegas-fear", label: "Fear Index" },
  { href: "/slots", label: "VQ Slots" },
];

function Board({
  rows,
  loading,
  failed,
}: {
  rows: BoardRow[];
  loading: string[];
  failed: string[];
}) {
  const [sport, setSport] = useState<Sport | "all">("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const counts = tally(rows).bySport;
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (g) =>
      (sport === "all" || g.sport === sport) &&
      (!q || `${g.away} ${g.home}`.toLowerCase().includes(q)),
  );
  const visible = all ? shown : shown.slice(0, 24);
  return (
    <section className="h3-section" aria-labelledby="h3-board-title">
      <div className="h3-heading">
        <div>
          <span className="h3-eyebrow">
            <Radio size={13} /> Every game · Eastern time
          </span>
          <h2 id="h3-board-title">Tonight&rsquo;s board</h2>
        </div>
      </div>
      <div className="h3-chips" role="group" aria-label="Filter by sport">
        <button aria-pressed={sport === "all"} onClick={() => setSport("all")}>
          All <small>{rows.length}</small>
        </button>
        {liveSports().map((s) => (
          <button
            key={s}
            aria-pressed={sport === s}
            onClick={() => setSport(s)}
          >
            {SPORTS[s].label} <small>{counts[s] || 0}</small>
          </button>
        ))}
      </div>
      <label className="h3-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Find a team</span>
        <input
          type="search"
          value={query}
          placeholder="Find a team"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {loading.length > 0 && (
        <p className="h3-quiet" role="status">
          Loading {loading.join(", ")}…
        </p>
      )}
      {failed.length > 0 && (
        <p className="h3-quiet" role="status">
          {failed.join(", ")} schedule unavailable right now.
        </p>
      )}
      <ul className="h3-board">
        {visible.map((g) => {
          const a = score(g, "away"),
            h = score(g, "home");
          return (
            <li key={`${g.sport}:${g.id}`}>
              <Link href={g.href} className={`h3-game ${g.phase}`}>
                <span className="h3-when">
                  {g.phase === "live" ? (
                    <span className="h3-live">
                      <i aria-hidden="true" /> {g.live?.detail || "Live"}
                    </span>
                  ) : g.phase === "final" ? (
                    "Final"
                  ) : (
                    startLabel(g)
                  )}
                  <small>{SPORTS[g.sport].label}</small>
                </span>
                <span className="h3-teams">
                  <span
                    className={a != null && h != null && a > h ? "lead" : ""}
                  >
                    {g.away}
                    {a != null && <b>{a}</b>}
                  </span>
                  <span
                    className={a != null && h != null && h > a ? "lead" : ""}
                  >
                    {g.home}
                    {h != null && <b>{h}</b>}
                  </span>
                </span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {!visible.length && !loading.length && (
        <p className="h3-quiet">No games match.</p>
      )}
      {shown.length > visible.length && (
        <button className="h3-more" onClick={() => setAll(true)}>
          Show all {shown.length} games
        </button>
      )}
    </section>
  );
}

export type Home3ViewProps = {
  now: number;
  dayLabel: string;
  name: string;
  rows: BoardRow[];
  edges: Edges;
  loading: string[];
  failed: string[];
  zoneHref: string;
  dealer: ReactNode;
};

/** The arena Home, display only: greeting, live ticker, edges, streaks, The Dealer, board, tools. */
export function Home3View({
  now,
  dayLabel,
  name,
  rows,
  edges,
  loading,
  failed,
  zoneHref,
  dealer,
}: Home3ViewProps) {
  const t = tally(rows);
  return (
    <div className="home3">
      <header className="h3-hello">
        <h1>
          {greeting(now)}
          {name ? `, ${name}` : ""}.
        </h1>
        <p>
          {dayLabel} · {t.games} {t.games === 1 ? "game" : "games"} tonight
          {t.live > 0 && (
            <>
              {" · "}
              <span className="h3-live">
                <i aria-hidden="true" /> {t.live} live now
              </span>
            </>
          )}
        </p>
      </header>
      <Ticker rows={rows} />
      <Headliner edges={edges} now={now} />
      <EdgeRail edges={edges} now={now} />
      <StreakRail rows={edges.rows} now={now} />
      <section
        className="h3-section h3-dealer"
        aria-labelledby="h3-dealer-title"
      >
        <div className="h3-heading">
          <div>
            <span className="h3-eyebrow">Published research</span>
            <h2 id="h3-dealer-title">From The Dealer</h2>
          </div>
          <Link href={zoneHref}>
            The Zone <ArrowUpRight size={15} />
          </Link>
        </div>
        {dealer}
      </section>
      <Board rows={rows} loading={loading} failed={failed} />
      <nav className="h3-pills" aria-label="Your tools">
        {PILLS.map((p) => (
          <Link key={p.href} href={p.href} className={p.hot ? "hot" : ""}>
            {p.label}
          </Link>
        ))}
      </nav>
      <footer className="h3-foot">
        Research, not guarantees. Edges compare our estimate with the
        book&rsquo;s no-vig price on fresh lines only.
      </footer>
    </div>
  );
}

/** The arena Home with its reads: schedules, live scores, tonight's props and The Dealer. */
export default function Home3({
  nflGames,
  nflUnavailable = false,
  zoneHref = "/community",
}: Home3Props) {
  const nfl = useNflGames(nflGames, nflUnavailable);
  const {
    now,
    day,
    rows: tonight,
    loads,
  } = useTonightSchedules(nfl.games, nfl.failed);
  const live = useLiveScores();
  const edges = useEdges();
  const name = useName();
  const rows = useMemo(() => board(tonight, live), [tonight, live]);
  const clientSports = ["nba", "nhl", "ncaab"] as const;
  return (
    <Home3View
      now={now}
      dayLabel={day.label}
      name={name}
      rows={rows}
      edges={edges}
      zoneHref={zoneHref}
      loading={clientSports
        .filter((s) => loads[s].state === "loading")
        .map((s) => SPORTS[s].label)}
      failed={[
        ...(nfl.failed ? ["NFL"] : []),
        ...clientSports
          .filter((s) => loads[s].state === "error")
          .map((s) => SPORTS[s].label),
      ]}
      dealer={
        <SectionBoundary name="Dealer publications">
          <HomeDealer sport="all" zoneHref={zoneHref} />
        </SectionBoundary>
      }
    />
  );
}
