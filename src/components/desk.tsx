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
import PickCard from "./pick-card";
import PublicOverview from "./public-overview";
import { noAccess, type Access, type Overview } from "@/lib/membership";
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
  page: "home" | "game" | "history";
  gameSlug?: string;
}) {
  const [d, setD] = useState(initial),
    [checkingAccess, setCheckingAccess] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
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
    return (
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
        <div className="heading">
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
                : page === "history"
                  ? "The permanent ledger"
                  : g
                    ? `${g.away_team.replace("Pittsburgh ", "").replace("Cleveland ", "")} @ ${g.home_team.replace("Cleveland ", "")}`
                    : "Matchup desk"}
            </h1>
            <p>
              {page === "home"
                ? "5 games. 5 decisions. $20 starting bankroll."
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
            <section className="stats">
              <Stat
                label="Starting bankroll"
                value={money(ch.starting_cents)}
                note="Maximum initial loss: $20"
              />
              <Stat
                label="Current bankroll"
                value={money(ch.balance_cents)}
                note={
                  <span className={m.net < 0 ? "negative" : "positive"}>
                    {signedMoney(m.net)} settled P/L
                  </span>
                }
              />
              <Stat
                label="Target bankroll"
                value="≈ $640"
                note="Aspirational · not guaranteed"
              />
              <Stat
                label="Challenge record"
                value={`${m.wins} W / ${m.losses} L`}
                note={`${d.results.filter((r) => challengePicks.some((p) => p.id === r.pick_id) && ["PUSH", "VOID"].includes(r.result)).length} pushes / voids`}
              />
            </section>
            <div className="status-strip">
              <span>
                Current stage <b>{ch.current_stage} of 5</b>
              </span>
              <span>
                Average price CLV <b>{pct(m.avgClv)}</b>
              </span>
              <span>
                Challenge status{" "}
                <Badge
                  tone={
                    ch.status === "PASS / PAUSED"
                      ? "gold"
                      : ch.status === "LOST"
                        ? "red"
                        : "green"
                  }
                >
                  {ch.status}
                </Badge>
              </span>
            </div>
            <section className="stage-track" aria-label="Five challenge stages">
              {stages.map((s) => (
                <div
                  className={`stage-step ${s.stage_number === ch.current_stage ? "current" : ""}`}
                  key={s.id}
                >
                  <span className="stage-number">
                    {s.status === "WON" ? (
                      <Check size={16} />
                    ) : (
                      String(s.stage_number).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <strong>
                      {s.stage_number === 1
                        ? "Thursday night"
                        : s.stage_number === 2
                          ? "Sunday · 1 PM"
                          : s.stage_number === 3
                            ? "Sunday · 4 PM"
                            : s.stage_number === 4
                              ? "Sunday night"
                              : "Monday night"}
                    </strong>
                    <small>{s.status === "PREP" ? "Upcoming" : s.status}</small>
                    {s.game_id && (
                      <Link
                        href={`/games/${d.games.find((g) => g.id === s.game_id)?.slug}`}
                      >
                        Matchup <ArrowRight size={11} />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </section>
            {ch.status === "PASS / PAUSED" && (
              <div className="pause-banner">
                <ShieldCheck size={21} />
                <div>
                  <strong>PASS — CHALLENGE PAUSED</strong>
                  <p>
                    {ch.pause_reason} No substitute wager. An explicit resume is
                    required.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        {page !== "history" && (
          <div className="content-grid">
            <div className="primary-column">
              {g ? (
                <section className="panel matchup-panel">
                  <div className="panel-head">
                    <span className="eyebrow">{g.slot}</span>
                    <Badge tone="green">{gameStatus}</Badge>
                  </div>
                  <div className="teams">
                    <div>
                      <span className="team-code">
                        {g.away_team === "Pittsburgh Steelers"
                          ? "PIT"
                          : g.away_team
                              .split(" ")
                              .at(-1)
                              ?.slice(0, 3)
                              .toUpperCase()}
                      </span>
                      <h2>{g.away_team}</h2>
                      <small>AWAY</small>
                    </div>
                    <span className="versus">@</span>
                    <div>
                      <span className="team-code home-code">
                        {g.home_team === "Cleveland Browns"
                          ? "CLE"
                          : g.home_team
                              .split(" ")
                              .at(-1)
                              ?.slice(0, 3)
                              .toUpperCase()}
                      </span>
                      <h2>{g.home_team}</h2>
                      <small>HOME</small>
                    </div>
                  </div>
                  <div className="matchup-meta">
                    <span>
                      <Clock3 size={14} />
                      {time(g.kickoff)}
                    </span>
                    <span>
                      <MapPin size={14} />
                      {g.venue}
                    </span>
                  </div>
                  <div className="market-strip">
                    {[
                      ["Current spread", market?.spread],
                      ["Current moneyline", market?.moneyline],
                      ["Current total", market?.total],
                    ].map(([label, v]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{v || "—"}</strong>
                        <small>
                          {v
                            ? "Published market snapshot"
                            : "Awaiting verified price"}
                        </small>
                      </div>
                    ))}
                  </div>
                  {market && (
                    <p className="market-source">
                      As of {time(market.observed_at)} ·{" "}
                      <SourceLink href={market.source}>
                        Market source
                      </SourceLink>
                    </p>
                  )}
                  <div className="panel-foot">
                    <span>
                      <i className="tiny-dot" />
                      {a
                        ? `Analysis v${a.version} · ${time(a.created_at)}`
                        : "No official pick has been published."}
                    </span>
                    {page === "home" && (
                      <Link href={`/games/${g.slug}`}>
                        Open matchup desk
                        <ArrowRight size={15} />
                      </Link>
                    )}
                  </div>
                </section>
              ) : (
                <Panel title="Next matchup">
                  <Empty title="The next game hasn’t been selected.">
                    One game will be chosen for this stage. No random
                    substitute.
                  </Empty>
                </Panel>
              )}
              {page === "home" && official && (
                <PickCard p={official} d={d} allowShare />
              )}
              {page === "game" &&
                gamePicks.map((p) => (
                  <PickCard key={p.id} p={p} d={d} allowShare />
                ))}
              {page === "home" && (
                <Panel
                  title="Research notebook"
                  aside={<span className="muted">Vegas Quant Ultra</span>}
                >
                  {a ? (
                    <ResearchNotebook
                      key={a.id}
                      analysis={a}
                      slug={g?.slug}
                      official={Boolean(official)}
                    />
                  ) : (
                    <Empty title="The read is still developing.">
                      Vegas Quant Ultra is reviewing the game. Market prices,
                      fair lines, probabilities, and recommendations will appear
                      only when supplied.
                    </Empty>
                  )}
                </Panel>
              )}
              {page === "home" && ch && (
                <Panel
                  title="The bankroll path"
                  aside={<Badge tone="gold">Aspirational target</Badge>}
                >
                  <BankrollChart d={d} challengeId={ch.id} />
                  <div className="ladder-path">
                    {[20, 40, 80, 160, 320, 640].map((n, i) => (
                      <div key={n}>
                        <span>{i === 0 ? "START" : `SPOT ${i}`}</span>
                        <b>${n}</b>
                      </div>
                    ))}
                  </div>
                  <p className="chart-note">
                    Illustrative +100 ladder only. Actual balances use the
                    entered odds and stake; no stage is forced.
                  </p>
                </Panel>
              )}
              {page === "game" && g && (
                <>
                  <Panel
                    title="Market history"
                    aside={
                      <Badge>
                        {d.markets.filter((m) => m.game_id === g.id).length}{" "}
                        snapshots
                      </Badge>
                    }
                  >
                    <div className="market-summary">
                      <span>
                        Opening spread <b>{opening?.spread || "—"}</b>
                      </span>
                      <span>
                        Opening ML <b>{opening?.moneyline || "—"}</b>
                      </span>
                      <span>
                        Opening total <b>{opening?.total || "—"}</b>
                      </span>
                      <span>
                        Line movement{" "}
                        <b>
                          {a?.projections.line_movement ||
                            market?.notes ||
                            "Awaiting analyst"}
                        </b>
                      </span>
                    </div>
                    {d.markets
                      .filter((m) => m.game_id === g.id)
                      .map((m) => (
                        <div className="market-row" key={m.id}>
                          <span>
                            {time(m.observed_at)}
                            <small>{m.kind}</small>
                          </span>
                          <b>
                            {m.spread || "—"} / {m.moneyline || "—"} /{" "}
                            {m.total || "—"}
                          </b>
                          <SourceLink href={m.source}>Source</SourceLink>
                        </div>
                      ))}
                  </Panel>
                  <Panel
                    title="The full handicap"
                    aside={
                      <Badge>{a ? `VERSION ${a.version}` : "PENDING"}</Badge>
                    }
                  >
                    {sectionNames.map((section, i) => (
                      <details className="analysis-section" key={section}>
                        <summary>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          {section}
                          <b>+</b>
                        </summary>
                        <div className="notebook">
                          <p className="preserve">
                            {a?.sections[section] ||
                              "Not yet provided by Vegas Quant Ultra."}
                          </p>
                        </div>
                      </details>
                    ))}
                  </Panel>
                  <Panel
                    title="Analysis version history"
                    aside={
                      <span className="muted">Append-only · all times ET</span>
                    }
                  >
                    <GameTimeline d={d} gameId={g.id} />
                  </Panel>
                </>
              )}
            </div>
            <aside className="secondary-column">
              <Panel
                title="Decision gate"
                aside={<ShieldCheck size={19} />}
                className="decision-panel"
              >
                <div className="gate-symbol">
                  <ShieldCheck size={29} />
                </div>
                <h3>
                  {ch?.status === "PASS / PAUSED"
                    ? "The challenge is paused."
                    : official
                      ? "Official decision published."
                      : "Patience is a position."}
                </h3>
                <p>
                  {official
                    ? "The original recommendation and entry information are preserved."
                    : "No qualifying edge, no wager. The schedule never overrides the analysis."}
                </p>
                <div className="threshold">
                  <span>Minimum analyst edge</span>
                  <b>3.00%</b>
                </div>
                <div className="threshold">
                  <span>Official position</span>
                  <b>{official ? "Published" : "None"}</b>
                </div>
                <div className="gate-lock">
                  <ShieldCheck size={15} />
                  {official
                    ? "Snapshot locked at publication"
                    : "Awaiting analyst handoff"}
                </div>
                <small>
                  Injury, weather, price, or data uncertainty can trigger a pass
                  at any time before publication.
                </small>
              </Panel>
              <Panel
                title="Vegas Quant fair lines"
                aside={<Activity size={17} />}
              >
                <div className="projection-list">
                  {[
                    ["Fair spread", "true_spread"],
                    ["Fair moneyline", "true_moneyline"],
                    ["Fair total", "true_total"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <b>{value(a?.projections[key])}</b>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Market intelligence">
                <div className="projection-list">
                  {[
                    ["Sportsbook Fear Index", "fear_index"],
                    ["Public side", "public_side"],
                    ["Sharp side", "sharp_side"],
                    ["Dangerous side", "dangerous_side"],
                    ["Trap risk", "trap_risk"],
                    ["Predicted closing line", "predicted_close"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <span>{label}</span>
                      <b>{value(a?.projections[key])}</b>
                    </div>
                  ))}
                </div>
                <p className="panel-caption">
                  Analyst-provided labels; not independently verified measures
                  of sportsbook liability.
                </p>
              </Panel>
              <section className="quote-card">
                <span>THE HOUSE RULE</span>
                <blockquote>
                  “A winning outcome doesn’t repair a bad decision.”
                </blockquote>
                <p>Grade the process independently of the result.</p>
              </section>
            </aside>
          </div>
        )}
        {page === "history" && (
          <>
            <section className="stats ledger-stats">
              <Stat label="Record" value={`${lm.wins} W / ${lm.losses} L`} />
              <Stat label="Win rate" value={pct(lm.winRate)} />
              <Stat label="ROI" value={pct(lm.roi)} />
              <Stat
                label="Net P/L"
                value={signedMoney(lm.net)}
                tone={lm.net < 0 ? "negative" : "positive"}
              />
              <Stat label="Average edge" value={pct(lm.avgEdge)} />
              <Stat label="Average price CLV" value={pct(lm.avgClv)} />
              <Stat label="CLV win rate" value={pct(lm.clvWinRate)} />
              <Stat
                label="Average confidence"
                value={
                  lm.avgConfidence === null
                    ? "—"
                    : `${lm.avgConfidence.toFixed(1)}/10`
                }
              />
              <Stat
                label="Average process grade"
                value={
                  lm.avgGrade === null ? "—" : `${lm.avgGrade.toFixed(1)}/4`
                }
                note="A=4 · B=3 · C=2 · D=1 · F=0"
              />
            </section>
            <div className="filter-bar">
              <div className="filter-pills">
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
                  <button
                    className={filter === f ? "selected" : ""}
                    key={f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
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
              <div className="table-scroll">
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
                    {ledgerPicks.map((p) => {
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
              {!ledgerPicks.length && (
                <Empty title="No official positions yet.">
                  All official picks—including losses—will remain in this ledger
                  permanently.
                </Empty>
              )}
            </Panel>
            <div className="two-col">
              <Panel title="Challenge accounting">
                <div className="notebook">
                  <p>
                    Each challenge begins with $20. Capital rolls forward at the
                    actual entry odds. A pass preserves the balance and pauses
                    progression.
                  </p>
                  <p>
                    Target: approximately $640. The target is aspirational, not
                    a forecast.
                  </p>
                </div>
              </Panel>
              <Panel title="Long-term betting">
                <div className="notebook">
                  <p>
                    Standalone picks are tracked separately from challenge
                    capital.
                  </p>
                  <h3>{signedMoney(lt.net)} standalone P/L</h3>
                  <p>
                    Units won/lost are not shown until you define a long-term
                    unit size. No unit value or account bankroll is assumed.
                  </p>
                </div>
              </Panel>
            </div>
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
