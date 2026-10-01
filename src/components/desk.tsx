"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Download,
  Flag,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import {
  clv,
  emptyDesk,
  gradePoints,
  lineText,
  metrics,
  money,
  odd,
  sectionNames,
  signedMoney,
  time,
  type Desk,
  type Game,
  type Pick,
} from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import { Badge, Empty, Panel, Shell, SourceLink, Stat } from "./ui";
import PersonalChallenge from "./personal-challenge";
import PickCard from "./pick-card";
import PublicOverview from "./public-overview";
import { noAccess, type Access, type Overview } from "@/lib/membership";
import UpdateFeed from "./update-feed";
import Performance from "./performance";
import SourceStatus from "./source-status";
import ResearchNotebook from "./research-notebook";
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);
const value = (s: unknown) =>
  s === undefined || s === null || s === "" ? "Awaiting analyst" : String(s);
export default function DeskApp({
  initial,
  page,
  gameSlug,
}: {
  initial: Desk;
  page: "home" | "game" | "history" | "performance";
  gameSlug?: string;
}) {
  const [d, setD] = useState(initial),
    [checkingAccess, setCheckingAccess] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
    [ledgerSearch, setLedgerSearch] = useState(""),
    [ledgerLimit, setLedgerLimit] = useState(25),
    [challengeFilter, setChallengeFilter] = useState("All"),
    [selectedChallenge, setSelectedChallenge] = useState(
      initial.challenges[0]?.id || "",
    );
  useEffect(() => {
    let live = true;
    let fetching = false;
    async function refresh() {
      if (fetching || document.visibilityState === "hidden") return;
      fetching = true;
      const { data, error } = await supabase.rpc("desk_data");
      if (live) {
        if (error) {
          setD({ ...initial, access: noAccess } as Desk);
          setError(
            "We couldn’t check your research access. Refresh the page to try again, or open Account to check your sign-in.",
          );
        } else {
          setD(data);
          setError("");
        }
        setCheckingAccess(false);
      }
      fetching = false;
    }
    const channel = supabase
      .channel("public-research-desk")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        () => void refresh(),
      )
      .subscribe();
    void refresh();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      setD(initial);
      setTimeout(() => void refresh(), 0);
    });
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      authListener.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
      void supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    const desired =
      new URLSearchParams(window.location.search).get("challenge") ||
      sessionStorage.getItem("vq-join-challenge");
    if (desired && d.challenges.some((c) => c.id === desired)) {
      setSelectedChallenge(desired);
      sessionStorage.removeItem("vq-join-challenge");
    }
  }, [d.challenges]);
  const ch =
      d.challenges.find((c) => c.id === selectedChallenge) || d.challenges[0],
    stages = d.stages.filter((s) => s.challenge_id === ch?.id),
    stage = stages.find((s) => s.stage_number === ch?.current_stage),
    g =
      page === "game"
        ? d.games.find((g) => g.slug === gameSlug)
        : d.games.find((g) => g.id === stage?.game_id),
    a = d.analyses.find((a) => a.game_id === g?.id),
    opening = d.markets
      .filter((m) => m.game_id === g?.id && m.kind === "opening")
      .at(-1),
    market =
      d.markets.find((m) => m.game_id === g?.id && m.kind === "current") ||
      opening;
  const challengePicks = d.picks.filter((p) =>
      stages.some((s) => s.id === p.stage_id),
    ),
    m = metrics(d, challengePicks),
    official = d.picks.find(
      (p) =>
        p.game_id === g?.id && (page === "game" || p.stage_id === stage?.id),
    ),
    gamePicks = d.picks.filter((p) => p.game_id === g?.id);
  const gameStatus =
    d.stages.find((s) => s.game_id === g?.id && s.challenge_id === ch?.id)
      ?.status || (official ? "OFFICIAL PLAY" : "ANALYSIS IN PROGRESS");
  const longTermPicks = d.picks.filter((p) => !p.stage_id),
    lt = metrics(d, longTermPicks);
  const ledgerPicks = d.picks.filter((p) => {
    const r = d.results.find((r) => r.pick_id === p.id),
      c = clv(
        p,
        d.entries.find((e) => e.pick_id === p.id),
        d.closings.find((c) => c.pick_id === p.id),
      );
    const st = d.stages.find((s) => s.id === p.stage_id);
    const game = d.games.find((g) => g.id === p.game_id);
    return (
      `${p.selection} ${game?.away_team || ""} ${game?.home_team || ""}`
        .toLowerCase()
        .includes(ledgerSearch.toLowerCase()) &&
      (challengeFilter === "All" ||
        (challengeFilter === "Standalone"
          ? !p.stage_id
          : st?.challenge_id === challengeFilter)) &&
      (filter === "All" ||
        (filter === "Sides" && ["Side", "Moneyline"].includes(p.market)) ||
        (filter === "Totals" && p.market === "Total") ||
        (filter === "Player Props" && p.market === "Player Prop") ||
        (filter === "Wins" && r?.result === "WIN") ||
        (filter === "Losses" && r?.result === "LOSS") ||
        (filter === "Positive CLV" && c.price !== null && c.price > 0) ||
        (filter === "Negative CLV" && c.price !== null && c.price < 0))
    );
  });
  const lm = metrics(d, ledgerPicks);
  function exportLedger() {
    const rows = [
      [
        "Date",
        "Game",
        "Stage",
        "Market",
        "Pick",
        "Recommended Line",
        "Bet Line",
        "Odds",
        "Closing Line",
        "Closing Odds",
        "Price CLV %",
        "Line CLV pts",
        "Stake",
        "Result",
        "Profit/Loss",
        "Bankroll",
        "Confidence",
        "Edge",
        "Process Grade",
      ],
      ...ledgerPicks.map((p) => {
        const game = d.games.find((g) => g.id === p.game_id),
          st = d.stages.find((s) => s.id === p.stage_id),
          e = d.entries.find((e) => e.pick_id === p.id),
          close = d.closings.find((c) => c.pick_id === p.id),
          r = d.results.find((r) => r.pick_id === p.id),
          review = d.reviews.find((r) => r.pick_id === p.id),
          c = clv(p, e, close);
        return [
          p.created_at,
          `${game?.away_team} @ ${game?.home_team}`,
          st?.stage_number ?? "",
          p.market,
          p.selection,
          p.recommended_line ?? "",
          e?.line ?? "",
          e?.odds ?? p.odds,
          close?.line ?? "",
          close?.odds ?? "",
          c.price ?? "",
          c.points ?? "",
          p.stake_cents / 100,
          r?.result ?? "",
          r ? r.profit_cents / 100 : "",
          r?.bankroll_cents !== null && r?.bankroll_cents !== undefined
            ? r.bankroll_cents / 100
            : "",
          p.confidence,
          p.edge,
          review?.grade ?? "",
        ];
      }),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((v) => {
            let text = String(v);
            if (/^[=+@\-\t\r]/.test(text) && typeof v === "string")
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "vegas-quant-ledger.csv";
    el.click();
    URL.revokeObjectURL(url);
  }
  const access = (d as Desk & { access?: Access }).access || noAccess;
  if (!access.allowed)
    return (
      <PublicOverview
        page={page}
        gameSlug={gameSlug}
        loading={checkingAccess}
        error={error}
        overview={(d as Desk & { overview?: Overview }).overview}
        games={d.games}
      />
    );
  return (
    <div
      className={access.admin ? "" : "member-watermarked"}
      style={
        {
          "--member-mark": JSON.stringify(
            `VEGAS QUANT · ${access.member_code}`,
          ),
        } as React.CSSProperties
      }
    >
      <Shell active={page}>
        {!access.admin && (
          <div className="member-stamp">
            VEGAS QUANT · {access.member_code} · Personal access
          </div>
        )}
        <div
          className={`heading ${page === "home" ? `home-heading ${d.challenges.length <= 1 ? "single-challenge" : ""}` : ""}`}
        >
          <div>
            <div className="eyebrow">
              {page === "home"
                ? "THE VEGAS QUANT PROJECT"
                : page === "game"
                  ? "VEGAS QUANT ULTRA / RESEARCH"
                  : "EVERY DECISION. ON THE RECORD."}
            </div>
            <h1>
              {page === "home"
                ? "The 5-Spot Challenge"
                : page === "performance"
                  ? "Performance & process"
                  : page === "history"
                    ? "The permanent ledger"
                    : g
                      ? `${g.away_team.replace("Pittsburgh ", "").replace("Cleveland ", "")} @ ${g.home_team.replace("Cleveland ", "")}`
                      : "Matchup desk"}
            </h1>
            <p>
              {page === "home"
                ? "5 games. 5 decisions. $20 starting bankroll."
                : page === "performance"
                  ? "Measured results. Transparent samples. Every outcome retained."
                  : page === "history"
                    ? "Track execution. Grade the process. Keep the losses."
                    : "The handicap, the market, and the full history of the read."}
            </p>
          </div>
          {page === "home" ? (
            <label className="challenge-select">
              <Flag size={16} />
              <select
                aria-label="Select challenge"
                value={ch?.id || ""}
                onChange={(e) => setSelectedChallenge(e.target.value)}
              >
                {d.challenges.map((c) => (
                  <option value={c.id} key={c.id}>
                    Challenge #{c.number}
                  </option>
                ))}
              </select>
            </label>
          ) : page === "history" ? (
            <button className="secondary" onClick={exportLedger}>
              <Download size={15} />
              Export ledger
            </button>
          ) : (
            <Link className="secondary" href="/">
              The challenge
              <ArrowRight size={15} />
            </Link>
          )}
        </div>
        {error && <div className="notice">{error}</div>}
        {page === "home" && ch && (
          <>
            <PersonalChallenge
              renderOfficial={
                official
                  ? (entryAction) => (
                      <div className="featured-official">
                        <PickCard
                          p={official}
                          d={d}
                          compact
                          personalPath
                          entryAction={entryAction}
                        />
                      </div>
                    )
                  : undefined
              }
              key={`${ch.id}:${access.member_code}`}
              challenge={ch}
              stages={stages}
              pick={official}
              picks={challengePicks}
              results={d.results}
            />
          </>
        )}
        {page === "home" && (
          <details className="admin-section home-explore">
            <summary>Explore research & records</summary>
            <div className="workspace-index">
              <Link href="/games">
                <span className="eyebrow">RESEARCH</span>
                <h2>Matchup desk</h2>
                <p>Analysis, market snapshots and the history of the read.</p>
                <span>Open research →</span>
              </Link>
              <Link href="/history">
                <span className="eyebrow">RECORDS</span>
                <h2>Results & performance</h2>
                <p>Every published pick, closing line and process review.</p>
                <span>Open records →</span>
              </Link>
              {access.admin && (
                <Link href="/admin/intelligence">
                  <span className="eyebrow">PRIVATE</span>
                  <h2>Data Intelligence</h2>
                  <p>Market tape, consensus, news and execution quality.</p>
                  <span>Open private workspace →</span>
                </Link>
              )}
            </div>
          </details>
        )}
        {page === "game" && g && (
          <MatchupWorkspace d={d} game={g} memberCode={access.member_code} />
        )}
        {["history", "performance"].includes(page) && (
          <nav className="section-switch" aria-label="Records sections">
            <Link
              className={page === "history" ? "selected" : ""}
              href="/history"
            >
              Ledger
            </Link>
            <Link
              className={page === "performance" ? "selected" : ""}
              href="/performance"
            >
              Performance
            </Link>
          </nav>
        )}
        {page === "performance" && <Performance desk={d} />}
        {page === "history" && (
          <>
            <div className="filter-bar">
              <label className="field">
                Find a game / pick
                <input
                  type="search"
                  value={ledgerSearch}
                  onChange={(e) => {
                    setLedgerSearch(e.target.value);
                    setLedgerLimit(25);
                  }}
                />
              </label>
              <label className="field">
                Filter
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setLedgerLimit(25);
                  }}
                >
                  {[
                    "All",
                    "Sides",
                    "Totals",
                    "Player Props",
                    "Wins",
                    "Losses",
                    "Positive CLV",
                    "Negative CLV",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <select
                aria-label="Filter by challenge"
                value={challengeFilter}
                onChange={(e) => setChallengeFilter(e.target.value)}
              >
                <option value="All">All challenges & standalone</option>
                <option value="Standalone">Standalone / long-term</option>
                {d.challenges.map((c) => (
                  <option key={c.id} value={c.id}>
                    Challenge #{c.number}
                  </option>
                ))}
              </select>
            </div>
            <Panel
              title="Permanent betting ledger"
              aside={<Badge>{ledgerPicks.length} picks</Badge>}
            >
              <div className="ledger-desktop table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Game",
                        "Stage",
                        "Market",
                        "Pick",
                        "Recommended",
                        "Bet line",
                        "Odds",
                        "Close",
                        "Price CLV",
                        "Line CLV",
                        "Stake",
                        "Result",
                        "P/L",
                        "Bankroll",
                        "Confidence",
                        "Edge",
                        "Process",
                      ].map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerPicks.slice(0, ledgerLimit).map((p) => {
                      const game = d.games.find((g) => g.id === p.game_id),
                        st = d.stages.find((s) => s.id === p.stage_id),
                        e = d.entries.find((e) => e.pick_id === p.id),
                        close = d.closings.find((c) => c.pick_id === p.id),
                        r = d.results.find((r) => r.pick_id === p.id),
                        review = d.reviews.find((r) => r.pick_id === p.id),
                        c = clv(p, e, close);
                      return (
                        <tr key={p.id}>
                          <td>{time(p.created_at)}</td>
                          <td>
                            <Link href={`/games/${game?.slug}`}>
                              {game?.away_team} @ {game?.home_team}
                            </Link>
                          </td>
                          <td>{st?.stage_number || "Standalone"}</td>
                          <td>{p.market}</td>
                          <td>
                            <Link href={`/picks/${p.id}/share`}>
                              {p.selection}
                            </Link>
                          </td>
                          <td>{lineText(p.recommended_line)}</td>
                          <td>{e ? lineText(e.line) : "Unconfirmed"}</td>
                          <td>{odd(e?.odds ?? p.odds)}</td>
                          <td>
                            {close
                              ? `${lineText(close.line)} ${odd(close.odds)}`
                              : "—"}
                          </td>
                          <td>{pct(c.price)}</td>
                          <td>{c.points === null ? "—" : `${c.points} pts`}</td>
                          <td>{money(p.stake_cents)}</td>
                          <td>{r?.result || "OPEN"}</td>
                          <td
                            className={
                              r && r.profit_cents < 0 ? "negative" : "positive"
                            }
                          >
                            {r ? signedMoney(r.profit_cents) : "—"}
                          </td>
                          <td>
                            {r?.bankroll_cents !== undefined &&
                            r?.bankroll_cents !== null
                              ? money(r.bankroll_cents)
                              : "—"}
                          </td>
                          <td>{p.confidence}/10</td>
                          <td>{p.edge}%</td>
                          <td>{review?.grade || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ledger-mobile">
                {ledgerPicks.slice(0, ledgerLimit).map((p) => {
                  const r = d.results.find((r) => r.pick_id === p.id),
                    e = d.entries.find((e) => e.pick_id === p.id),
                    c = d.closings.find((c) => c.pick_id === p.id),
                    v = clv(p, e, c),
                    review = d.reviews.find((r) => r.pick_id === p.id);
                  return (
                    <article className="intel-row" key={p.id}>
                      <Badge tone={r?.result === "LOSS" ? "red" : "muted"}>
                        {r?.result || "OPEN"}
                      </Badge>
                      <h3>
                        <Link href={`/picks/${p.id}/share`}>{p.selection}</Link>
                      </h3>
                      <p>
                        {time(p.created_at)} · {money(p.stake_cents)} ·{" "}
                        {odd(p.odds)} published
                      </p>
                      <p>
                        {r ? signedMoney(r.profit_cents) : "Awaiting result"} ·
                        Price CLV {pct(v.price)}
                      </p>
                      <details>
                        <summary>Entry, close & process</summary>
                        <p>
                          Recommended {lineText(p.recommended_line)}{" "}
                          {odd(p.odds)}
                        </p>
                        <p>
                          Actual{" "}
                          {e
                            ? `${lineText(e.line)} ${odd(e.odds)}`
                            : "Not confirmed"}
                        </p>
                        <p>
                          Close{" "}
                          {c
                            ? `${lineText(c.line)} ${odd(c.odds)}`
                            : "Not recorded"}
                        </p>
                        <p>
                          Line CLV {v.points ?? "—"} · Process{" "}
                          {review?.grade || "Not reviewed"}
                        </p>
                        <p>
                          Confidence {p.confidence}/10 · Edge {p.edge} pp
                        </p>
                        {review && <p>{review.lessons}</p>}
                      </details>
                    </article>
                  );
                })}
              </div>
              {ledgerPicks.length > ledgerLimit && (
                <button
                  className="secondary"
                  onClick={() => setLedgerLimit((n) => n + 25)}
                >
                  Show 25 more picks
                </button>
              )}
              {!ledgerPicks.length && (
                <Empty title="No official positions yet.">
                  All official picks—including losses—will remain in this ledger
                  permanently.
                </Empty>
              )}
            </Panel>
            <details className="admin-section">
              <summary>Accounting rules</summary>
              <div className="notebook">
                <p>
                  Challenge bankrolls and standalone picks are tracked
                  separately. Each challenge starts with $20 and uses actual
                  entry odds. A pass pauses progression; the approximately $640
                  target is aspirational.
                </p>
                <p>
                  Missing entries and closes stay unconfirmed. Original
                  recommendations, losing picks and previous reviews are never
                  deleted.
                </p>
              </div>
            </details>
          </>
        )}
      </Shell>
    </div>
  );
}
function BankrollChart({ d, challengeId }: { d: Desk; challengeId: string }) {
  const c = d.challenges.find((c) => c.id === challengeId)!;
  const tx = d.transactions
    .filter((t) => t.challenge_id === c.id && t.kind !== "RESERVE")
    .toReversed();
  const values = tx.length
    ? tx.map((t) => t.balance_cents)
    : [c.starting_cents];
  const max = Math.max(...values, c.starting_cents) * 1.15,
    min = Math.min(0, ...values),
    range = max - min || 1;
  const points = values
    .map(
      (n, i) =>
        `${30 + (i * 600) / Math.max(1, values.length - 1)},${150 - ((n - min) / range) * 125}`,
    )
    .join(" ");
  return (
    <div className="bankroll-chart">
      <div>
        <strong>{money(c.balance_cents)}</strong>
        <small>ACTUAL CHALLENGE BALANCE</small>
      </div>
      <svg
        viewBox="0 0 660 175"
        aria-label={`Actual bankroll: ${values.map(money).join(", ")}`}
        role="img"
      >
        {[25, 85, 150].map((y) => (
          <line key={y} x1="30" x2="630" y1={y} y2={y} className="gridline" />
        ))}
        {values.length > 1 ? (
          <polyline
            points={points}
            fill="none"
            stroke="var(--green)"
            strokeWidth="3"
          />
        ) : (
          <line
            x1="30"
            x2="630"
            y1={150 - (c.starting_cents / range) * 125}
            y2={150 - (c.starting_cents / range) * 125}
            stroke="var(--green)"
            strokeWidth="2"
            strokeDasharray="5 7"
          />
        )}
        {values.map((n, i) => (
          <circle
            key={i}
            cx={30 + (i * 600) / Math.max(1, values.length - 1)}
            cy={150 - ((n - min) / range) * 125}
            r="4"
            fill="var(--green)"
          />
        ))}
      </svg>
      <div className="chart-axis">
        <span>Starting balance</span>
        <span>{values.length - 1} settled legs</span>
      </div>
    </div>
  );
}

function GameTimeline({ d, gameId }: { d: Desk; gameId: string }) {
  const events = [
    ...d.analyses
      .filter((a) => a.game_id === gameId)
      .map((a) => ({
        id: a.id,
        at: a.created_at,
        title: a.title,
        content: (
          <details>
            <summary>Read version {a.version}</summary>
            <div className="version-content">
              {Object.entries(a.sections).map(([k, v]) => (
                <div key={k}>
                  <h4>{k}</h4>
                  <p>{v}</p>
                </div>
              ))}
              {Object.entries(a.projections).map(([k, v]) => (
                <p key={k}>
                  <b>{k.replaceAll("_", " ")}:</b> {v}
                </p>
              ))}
              <h4>Original handoff</h4>
              <p>{a.raw_handoff}</p>
              <SourceLink href={a.source}>Source</SourceLink>
            </div>
          </details>
        ),
      })),
    ...d.markets
      .filter((m) => m.game_id === gameId)
      .map((m) => ({
        id: m.id,
        at: m.created_at,
        title:
          m.kind === "opening"
            ? "Opening market recorded"
            : "Market snapshot published",
        content: (
          <p>
            {m.spread || "—"} / {m.moneyline || "—"} / {m.total || "—"}
            <br />
            Observed {time(m.observed_at)} ·{" "}
            <SourceLink href={m.source}>Source</SourceLink>
          </p>
        ),
      })),
    ...d.picks
      .filter((p) => p.game_id === gameId)
      .map((p) => ({
        id: p.id,
        at: p.created_at,
        title: "OFFICIAL PLAY PUBLISHED",
        content: (
          <p>
            {p.selection} · {odd(p.odds)} · {money(p.stake_cents)}
          </p>
        ),
      })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return events.length ? (
    <div className="timeline">
      {events.map((e) => (
        <article key={e.id}>
          <span className="timeline-dot" />
          <small>{time(e.at)}</small>
          <h3>{e.title}</h3>
          {e.content}
        </article>
      ))}
    </div>
  ) : (
    <Empty title="No published versions yet.">
      Every analysis and market update will appear here with its original
      timestamp. Previous versions remain visible.
    </Empty>
  );
}

function MatchupWorkspace({
  d,
  game: g,
  memberCode,
}: {
  d: Desk;
  game: Game;
  memberCode: string | null;
}) {
  const [view, setView] = useState("Research"),
    [section, setSection] = useState<string>(sectionNames[0]),
    [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === "#analysis-history") {
        setView("Updates & history");
        setHistoryOpen(true);
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const a = d.analyses
    .filter((a) => a.game_id === g.id)
    .sort((a, b) => b.version - a.version)[0];
  const markets = d.markets.filter((m) => m.game_id === g.id),
    latest = markets
      .filter((m) => m.kind === "current")
      .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
  const picks = d.picks.filter((p) => p.game_id === g.id);
  return (
    <div className="matchup-workspace">
      <div className="matchup-meta">
        <span>
          {g.slot} · {time(g.kickoff)}
        </span>
        <span>{g.venue}</span>
        <Link href="/games">All matchups →</Link>
      </div>
      <nav className="section-switch" aria-label="Matchup sections">
        {["Research", "Market history", "Updates & history"].map((v) => (
          <button
            key={v}
            className={view === v ? "selected" : ""}
            onClick={() => setView(v)}
          >
            {v}
          </button>
        ))}
      </nav>
      {view === "Research" && (
        <Panel
          title="Research notebook"
          aside={<Badge>{a ? `VERSION ${a.version}` : "PENDING"}</Badge>}
        >
          <div className="notebook">
            <label className="field">
              Research category
              <select
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setExpanded(false);
                }}
              >
                {sectionNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {a && (
              <SourceStatus
                source={a.source}
                at={a.created_at}
                kind="Analyst publication"
              />
            )}
            <h3>{section}</h3>
            <div
              className={
                expanded ? "research-excerpt expanded" : "research-excerpt"
              }
            >
              <p className="preserve">
                {a?.sections[section] ||
                  "Not yet provided by Vegas Quant Ultra."}
              </p>
            </div>
            {a?.sections[section] && (
              <button
                className="text-link"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less ↑" : "Read full section ↓"}
              </button>
            )}
            {section === "Vegas Quant Projection" && a && (
              <div className="projection-list">
                {Object.entries(a.projections).map(([key, value]) => (
                  <div key={key}>
                    <span>{key.replaceAll("_", " ")}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            )}
            {picks.length > 0 && (
              <details className="admin-section">
                <summary>Published plays for this matchup</summary>
                {picks.map((p) => (
                  <p key={p.id}>
                    <Link href={`/picks/${p.id}/share`}>
                      {p.selection} · {odd(p.odds)} →
                    </Link>
                  </p>
                ))}
                <Link href="/">Current challenge & personal entry →</Link>
              </details>
            )}
          </div>
        </Panel>
      )}
      {view === "Market history" && (
        <Panel title="Published market snapshots">
          <div className="notebook">
            {latest && (
              <SourceStatus
                source={latest.source}
                at={latest.observed_at}
                kind="Market observation"
              />
            )}
            {!markets.length && (
              <Empty title="No snapshots supplied">
                No live odds feed is connected.
              </Empty>
            )}
            {markets.map((m) => (
              <details className="admin-section" key={m.id}>
                <summary>
                  {time(m.observed_at)} · {m.kind} ·{" "}
                  {m.spread || m.total || m.moneyline}
                </summary>
                <p>Spread: {m.spread || "—"}</p>
                <p>Moneyline: {m.moneyline || "—"}</p>
                <p>Total: {m.total || "—"}</p>
                <SourceLink href={m.source}>Source</SourceLink>
                <p>{m.notes}</p>
              </details>
            ))}
          </div>
        </Panel>
      )}
      {view === "Updates & history" && (
        <>
          <UpdateFeed desk={d} game={g} memberCode={memberCode} />
          <details
            className="admin-section"
            id="analysis-history"
            open={historyOpen}
            onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
          >
            <summary>Complete timestamped archive</summary>
            <GameTimeline d={d} gameId={g.id} />
          </details>
        </>
      )}
    </div>
  );
}
