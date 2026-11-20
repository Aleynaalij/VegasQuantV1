"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { combinedViewer } from "@/lib/viewer-auth";
import { noAccess, type Access } from "@/lib/membership";
import { nbaNickname, nbaWhen } from "@/lib/nba-home";
import { loadSlate, type Slate } from "@/lib/nba-tonight";
import { latestRequest } from "@/lib/latest-request";
import {
  SORTS,
  buildPropRows,
  filterRows,
  lean,
  sortRows,
  type PropRow,
  type PropSort,
} from "@/lib/nba-props";
import type { Market } from "@/lib/nba-research-tab";
import NbaPropCard from "./nba-prop-card";
import "@/app/nba-research-tab.css";
import "@/app/nba-props-board.css";

const STATS: { key: Market | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "player_points", label: "Points" },
  { key: "player_rebounds", label: "Rebounds" },
];
const SHORT = { player_points: "PTS", player_rebounds: "REB" } as const;
const odds = (p: number | null | undefined) =>
  p == null ? "—" : p > 0 ? `+${p}` : `${p}`;
const time = (iso: string) =>
  nbaWhen(iso, { hour: "numeric", minute: "2-digit" });
const abbr = (name: string | null, team: string) =>
  name || nbaNickname(team).slice(0, 3).toUpperCase();

function Headshot({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span className="pf-face" aria-hidden="true">
      {failed || combinedViewer ? (
        <span>{initials}</span>
      ) : (
        <img
          src={`https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`}
          alt=""
          width={48}
          height={35}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/** What the row shows for the side the numbers lean to. */
function side(r: PropRow) {
  const s = lean(r) || "over";
  const over = s === "over";
  const hits = r.l10 ? (over ? r.l10.hits : r.l10.n - r.l10.hits) : null;
  return {
    over,
    label: over ? "O" : "U",
    price: over ? r.trend.over : r.trend.under,
    best: over ? r.bestOver : r.bestUnder,
    chance: r.estimate
      ? over
        ? r.estimate.chance
        : 100 - r.estimate.chance
      : null,
    edge: r.edge == null ? null : over ? r.edge : -r.edge,
    hits,
    n: r.l10?.n ?? 0,
  };
}

function Strip({ r, over }: { r: PropRow; over: boolean }) {
  const last = r.games.slice(0, 10).reverse();
  return (
    <span className="pf-strip" aria-hidden="true">
      {last.map((g, i) => (
        <i key={i} className={g.over === over ? "pf-hit" : "pf-miss"} />
      ))}
    </span>
  );
}

export function PropRowItem({ r, onOpen }: { r: PropRow; onOpen: () => void }) {
  const s = side(r);
  const team = abbr(
    r.home ? r.game.home_abbreviation : r.game.away_abbreviation,
    r.player.team,
  );
  const tone =
    s.edge == null
      ? ""
      : s.edge >= 5
        ? "pf-strong"
        : s.edge >= 2
          ? "pf-lean"
          : "pf-flat";
  return (
    <li>
      <button type="button" className="pf-row" onClick={onOpen}>
        <Headshot id={r.player.athlete_id} name={r.trend.player} />
        <span className="pf-who">
          <b>{r.trend.player}</b>
          <small>
            {team} {r.home ? "vs" : "@"} {r.opponent} · {time(r.game.tipoff)}
            {r.splits[0] && (
              <em className="pf-mate">
                {" "}
                · w/o {r.splits[0].teammate.split(" ").slice(-1)[0]}{" "}
                {r.splits[0].without.hits}/{r.splits[0].without.n}
              </em>
            )}
          </small>
        </span>
        <span className={`pf-score ${tone}`}>
          <b>{s.chance == null ? "—" : `${s.chance}%`}</b>
          <small>
            {r.stale
              ? `old line · ${r.trend.observedAt ? time(r.trend.observedAt) : "time unknown"}`
              : s.edge == null
                ? "our est."
                : `${s.edge > 0 ? "+" : ""}${s.edge} edge`}
          </small>
        </span>
        <span className="pf-bet">
          <span className={s.over ? "pf-o" : "pf-u"}>{s.label}</span>{" "}
          <b>{r.trend.line}</b> {SHORT[r.trend.market]} <em>{odds(s.price)}</em>
        </span>
        <span className="pf-form">
          <Strip r={r} over={s.over} />
          <small>{s.hits == null ? "" : `${s.hits}/${s.n}`}</small>
        </span>
      </button>
    </li>
  );
}

export function PropSheet({
  r,
  slate,
  onClose,
}: {
  r: PropRow;
  slate: Slate;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const books = [...r.books].sort((a, b) => a.book.localeCompare(b.book));
  return (
    <div className="pf-scrim" onClick={onClose}>
      <div
        className="pf-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${r.trend.player} ${SHORT[r.trend.market]} ${r.trend.line}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pf-sheet-head">
          <Headshot id={r.player.athlete_id} name={r.trend.player} />
          <div>
            <h2>{r.trend.player}</h2>
            <small>
              {nbaNickname(r.player.team)} {r.home ? "vs" : "@"}{" "}
              {nbaNickname(r.defense)} · {time(r.game.tipoff)} ET
            </small>
          </div>
          <button
            ref={close}
            type="button"
            className="pf-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {books.length > 1 ? (
          <section className="pf-books" aria-label="Prices across books">
            <p>
              Shop the line · {r.trend.line} {SHORT[r.trend.market]}
            </p>
            <div className="pf-books-grid">
              <span />
              <b>Over</b>
              <b>Under</b>
              {books.map((b) => (
                <BookRow key={b.book} b={b} r={r} />
              ))}
            </div>
          </section>
        ) : null}
        {r.splits.length > 0 && <Splits r={r} />}
        <div className="nbar">
          <NbaPropCard
            trend={r.trend}
            player={r.player}
            defense={slate.defense}
            tonight={{
              tipoff: r.game.tipoff,
              home: r.home,
              opponent: r.opponent,
              defense: r.defense,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** With / without each teammate out tonight, against tonight's line. */
function Splits({ r }: { r: PropRow }) {
  const unit = SHORT[r.trend.market];
  return (
    <section className="pf-splits" aria-label="With and without teammates">
      <p>
        Teammates out tonight · {r.trend.line} {unit}
      </p>
      {r.splits.map((s) => {
        const up = s.without.avg >= s.with.avg;
        return (
          <div key={s.teammate} className="pf-split">
            <div className="pf-split-who">
              <b>{s.teammate}</b>
              <span className={s.status === "Out" ? "pf-out" : "pf-doubt"}>
                {s.status}
              </span>
            </div>
            <div className="pf-split-cols">
              <div className={up ? "pf-split-up" : "pf-split-down"}>
                <small>Without him</small>
                <b>
                  {s.without.hits}/{s.without.n}
                </b>
                <span>
                  over · {s.without.avg} {unit} avg
                </span>
              </div>
              <div>
                <small>With him</small>
                <b>
                  {s.with.hits}/{s.with.n}
                </b>
                <span>
                  over · {s.with.avg} {unit} avg
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <small className="pf-split-note">
        His games for this team this season. Games without him include any he
        missed or wasn&rsquo;t on the roster for.
      </small>
    </section>
  );
}

function BookRow({ b, r }: { b: PropRow["books"][number]; r: PropRow }) {
  const top = (side: "over" | "under") =>
    (side === "over" ? r.bestOver : r.bestUnder)?.book === b.book &&
    b[side] != null;
  return (
    <>
      <span>{b.book}</span>
      <span className={top("over") ? "pf-best" : undefined}>
        {odds(b.over)}
      </span>
      <span className={top("under") ? "pf-best" : undefined}>
        {odds(b.under)}
      </span>
    </>
  );
}

/**
 * NBA Prop Finder: every FanDuel points and rebounds line on tonight's slate in one ranked list.
 * Search a player, pick a stat, sort and game; tap a row for the full card. Research, not picks.
 */
export default function NbaPropsBoard() {
  const params = useSearchParams();
  const [slate, setSlate] = useState<Slate | null>(null);
  const [access, setAccess] = useState<Access>(noAccess);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(params.get("q") || "");
  const [market, setMarket] = useState<Market | "all">(
    params.get("stat") === "reb"
      ? "player_rebounds"
      : params.get("stat") === "pts"
        ? "player_points"
        : "all",
  );
  const [sort, setSort] = useState<PropSort>(
    SORTS.some((s) => s.key === params.get("sort"))
      ? (params.get("sort") as PropSort)
      : "edge",
  );
  const [game, setGame] = useState(params.get("game") || "all");
  const [open, setOpen] = useState<string | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const gate = latestRequest();
    // quiet: a background refresh keeps what is on screen if it fails.
    async function load(quiet = false) {
      const current = gate.start();
      try {
        const a = await supabase.rpc("membership_status");
        const status = a.error ? noAccess : (a.data as Access);
        const s = await loadSlate(
          status.allowed,
          params.get("game") || undefined,
        );
        if (!current()) return;
        setAccess(status);
        setSlate(s);
        setError("");
        setNow(Date.now());
      } catch {
        if (current() && !quiet)
          setError("Props could not load. Retry in a moment.");
      }
    }
    void load();
    // A sign-in or sign-out drops everything shown for the previous account at once, and any
    // request still running for it can no longer land.
    const stop = onUserChange(() => {
      gate.cancel();
      setOpen(null);
      setSlate(null);
      setAccess(noAccess);
      setError("");
      void load();
    });
    // Lines are collected about every 15 minutes: refresh quietly while the board is on screen,
    // and at once when it comes back into view. The clock ticks every minute so a line that ages
    // past an hour is flagged (and drops out of Best edge) even if a refresh fails.
    let fetchedAt = Date.now();
    const refreshIfDue = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      if (Date.now() - fetchedAt >= 15 * 60000) {
        fetchedAt = Date.now();
        void load(true);
      }
    };
    const tick = setInterval(refreshIfDue, 60000);
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      gate.cancel();
      stop();
      clearInterval(tick);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
    // The requested game is read once, on arrival; later chip changes filter the loaded slate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the view in the address bar, so a filtered board can be shared or reopened.
  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string, empty: string) =>
      v === empty ? u.searchParams.delete(k) : u.searchParams.set(k, v);
    set("q", query.trim(), "");
    set(
      "stat",
      market === "player_points"
        ? "pts"
        : market === "player_rebounds"
          ? "reb"
          : "all",
      "all",
    );
    set("sort", sort, "edge");
    set("game", game, "all");
    window.history.replaceState(null, "", u.toString());
  }, [query, market, sort, game]);

  const rows = useMemo(
    () => (slate ? buildPropRows(slate, now) : []),
    [slate, now],
  );
  const staleCount = rows.filter((r) => r.stale).length;
  const shown = useMemo(
    () => sortRows(filterRows(rows, { market, game, query }), sort),
    [rows, market, game, query, sort],
  );
  const active = rows.find((r) => r.key === open) || null;
  const closeSheet = useCallback(() => setOpen(null), []);

  if (error)
    return (
      <p className="pf-note" role="status">
        {error}
      </p>
    );

  return (
    <div className="pf">
      <header className="pf-head">
        <p className="pf-kicker">NBA · Prop Finder</p>
        <h1>Tonight&rsquo;s props, ranked</h1>
        <p className="pf-note">
          Every FanDuel points and rebounds line, scored against each
          player&rsquo;s game log. Tap a player for the full breakdown.
          {slate?.propsAt ? ` Lines as of ${time(slate.propsAt)} ET.` : ""}
        </p>
      </header>

      <div className="pf-controls">
        <label className="pf-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search player or team"
            aria-label="Search player or team"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="pf-chips" role="group" aria-label="Stat">
          {STATS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={market === s.key}
              onClick={() => setMarket(s.key)}
            >
              {s.label}
            </button>
          ))}
          <span className="pf-sep" aria-hidden="true" />
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {slate && slate.games.length > 1 ? (
          <div className="pf-chips pf-games" role="group" aria-label="Game">
            <button
              type="button"
              aria-pressed={game === "all"}
              onClick={() => setGame("all")}
            >
              All games
            </button>
            {slate.games.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={game === g.id}
                onClick={() => setGame(g.id)}
              >
                {abbr(g.away_abbreviation, g.away_team)} @{" "}
                {abbr(g.home_abbreviation, g.home_team)}
                <small> {time(g.tipoff)}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {staleCount ? (
        <p className="pf-stale" role="status">
          {staleCount} of {rows.length} FanDuel lines are over an hour old by
          the book&rsquo;s own time. They are marked &ldquo;old line&rdquo;,
          show no edge and sit at the bottom of Best edge until fresh prices
          arrive.
        </p>
      ) : null}
      {!slate ? (
        <ul className="pf-list" aria-busy="true" aria-label="Loading props">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="pf-skeleton" />
          ))}
        </ul>
      ) : !access.allowed ? (
        <div className="pf-empty">
          <b>Members see every prop</b>
          <p>
            Sign in with research access to rank tonight&rsquo;s lines against
            each player&rsquo;s game log.
          </p>
          <Link className="vq-btn" href="/membership">
            Sign in
          </Link>
        </div>
      ) : !rows.length ? (
        <div className="pf-empty">
          <b>No props posted yet</b>
          <p>
            Lines usually post by late morning ET. Check back closer to tip.
          </p>
        </div>
      ) : (
        <>
          <p className="pf-count">
            {shown.length} {shown.length === 1 ? "prop" : "props"} ·{" "}
            {SORTS.find((s) => s.key === sort)!.label.toLowerCase()}
          </p>
          {shown.length ? (
            <ul className="pf-list">
              {shown.map((r) => (
                <PropRowItem key={r.key} r={r} onOpen={() => setOpen(r.key)} />
              ))}
            </ul>
          ) : (
            <div className="pf-empty">
              <b>No props match</b>
              <p>Clear the search or pick another game.</p>
            </div>
          )}
          <p className="pf-note pf-foot">
            Our % is the chance the side shown hits, from the player&rsquo;s
            per-minute production, projected minutes and tonight&rsquo;s
            matchup. Edge is that minus FanDuel&rsquo;s no-vig chance. History
            and estimates, not picks.
          </p>
        </>
      )}
      {active && slate ? (
        <PropSheet r={active} slate={slate} onClose={closeSheet} />
      ) : null}
    </div>
  );
}
