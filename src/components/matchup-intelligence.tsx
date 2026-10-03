"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Access } from "@/lib/membership";
import { supabase } from "@/lib/supabase";
import { time, type Desk } from "@/lib/domain";
import {
  searchMatchup,
  type DirectoryRow,
  type MatchupAnalysis,
  type Target,
} from "@/lib/matchups";
import { Shell, Badge, Panel, Empty } from "./ui";
import SourceObservations from "./source-observations";
import PickCard from "./pick-card";
import ResearchSections from "./research-sections";
import ResearchNotebook from "./research-notebook";
import SourceStatus from "./source-status";
function Fields({ value }: { value: unknown }) {
  if (value == null) return <p className="muted">Not supplied.</p>;
  if (Array.isArray(value))
    return (
      <div>
        {value.length ? (
          value.map((v, i) => (
            <div className="mi-item" key={i}>
              <Fields value={v} />
            </div>
          ))
        ) : (
          <p className="muted">No items supplied.</p>
        )}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="mi-fields">
        {Object.entries(value)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k.replaceAll("_", " ")}</dt>
              <dd>
                {typeof v === "object" ? <Fields value={v} /> : String(v)}
              </dd>
            </div>
          ))}
      </dl>
    );
  return <p className="preserve">{String(value)}</p>;
}
function TargetCard({ target: t }: { target: Target }) {
  return (
    <article
      className={`mi-target ${t.status === "OFFICIAL" ? "mi-official" : ""}`}
    >
      <Badge tone={t.status === "OFFICIAL" ? "green" : "muted"}>
        {t.status === "OFFICIAL"
          ? "LINKED OFFICIAL PLAY"
          : t.status + " · TARGET ONLY"}
      </Badge>
      <h3>{t.selection}</h3>
      <Fields
        value={Object.fromEntries(
          Object.entries(t).filter(
            ([k]) => !["selection", "status", "official_pick_id"].includes(k),
          ),
        )}
      />
    </article>
  );
}
export default function MatchupIntelligence({
  initial,
  slug,
}: {
  initial: Desk;
  slug?: string;
}) {
  const [desk, setDesk] = useState<Desk & { access?: Access }>(initial),
    [rows, setRows] = useState<DirectoryRow[]>(
      initial.games.map((game) => ({ game, analysis: null, market: null })),
    ),
    [query, setQuery] = useState(""),
    [week, setWeek] = useState("current"),
    [windowFilter, setWindowFilter] = useState("All games"),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q.slice(0, 160));
  }, []);
  useEffect(() => {
    let live = true;
    async function refresh() {
      const n = ++epoch.current;
      try {
        const [directory, d, publicStatus] = await Promise.all([
          supabase.rpc("matchup_directory"),
          supabase.rpc("desk_data"),
          supabase.rpc("public_research_status"),
        ]);
        if (directory.error || d.error)
          throw Error("Unable to refresh research. Please retry.");
        if (live && n === epoch.current) {
          setRows(
            directory.data.map((row: DirectoryRow) => {
              const status = publicStatus.data?.games?.find(
                (g: { game_id: string }) => g.game_id === row.game.id,
              );
              return {
                ...row,
                research_available: publicStatus.error ? undefined : !!status,
                research_updated_at: status?.updated_at,
              };
            }),
          );
          setDesk(d.data);
          setError("");
        }
      } catch (e) {
        if (live && n === epoch.current)
          setError(e instanceof Error ? e.message : "Load failed");
      }
    }
    void refresh();
    const listener = supabase.auth.onAuthStateChange(() => {
      ++epoch.current;
      setRows(
        initial.games.map((game) => ({ game, analysis: null, market: null })),
      );
      setDesk(initial);
      setTimeout(() => void refresh(), 0);
    });
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      ++epoch.current;
      listener.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [initial]);
  const row = slug ? rows.find((r) => r.game.slug === slug) : null;
  const versions = (
    row ? desk.analyses.filter((a) => a.game_id === row.game.id) : []
  ) as MatchupAnalysis[];
  const current = versions.find((a) => a.id === selected) || versions[0],
    intel = current?.intelligence;
  const official = row
    ? desk.picks.filter((p) => p.game_id === row.game.id)
    : [];
  const groups = [
    "Thursday",
    "Sunday Early",
    "Sunday Late",
    "Sunday Night",
    "Monday Night",
    "Other",
  ];
  function group(r: DirectoryRow) {
    const slot = r.game.slot.toLowerCase();
    if (slot.includes("international")) return "Other";
    if (slot.includes("thursday")) return "Thursday";
    if (slot.includes("monday")) return "Monday Night";
    if (slot.includes("sunday"))
      return slot.includes("night")
        ? "Sunday Night"
        : slot.includes("4") || slot.includes("late")
          ? "Sunday Late"
          : "Sunday Early";
    return "Other";
  }
  const currentWeek = [...rows]
    .sort((a, b) => Date.parse(a.game.kickoff) - Date.parse(b.game.kickoff))
    .find((r) => Date.parse(r.game.kickoff) > Date.now())?.game.week;
  const filtered = rows.filter(
    (r) =>
      searchMatchup(r.game, query) &&
      (windowFilter === "All games" || group(r) === windowFilter) &&
      (!week ||
        String(r.game.week) ===
          (week === "current" ? String(currentWeek) : week)),
  );
  const ranked = filtered
    .flatMap((r) =>
      (r.analysis?.intelligence?.targets || [])
        .filter((t) => t.rank != null)
        .map((t) => ({ t, r })),
    )
    .sort((a, b) => a.t.rank! - b.t.rank!);
  return (
    <div
      className={
        desk.access?.allowed && !desk.access.admin ? "member-watermarked" : ""
      }
      style={
        {
          "--member-mark": JSON.stringify(
            `VEGAS QUANT · ${desk.access?.member_code || ""}`,
          ),
        } as CSSProperties
      }
    >
      <Shell active="game">
        <div className="heading">
          <div>
            <span className="eyebrow">VEGAS QUANT INTELLIGENCE</span>
            <h1>
              {row
                ? `${row.game.away_abbreviation || row.game.away_team} @ ${row.game.home_abbreviation || row.game.home_team}`
                : "Scout the slate."}
            </h1>
            <p>
              {row
                ? `${time(row.game.kickoff)} · ${row.game.venue}`
                : "Find your game. Follow the read. Know what we’re watching."}
            </p>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        {!row ? (
          <>
            <div className="mi-search">
              <label>
                SEARCH MATCHUP
                <input
                  type="search"
                  placeholder="PIT CLE, Bills, Week 4, Sunday 1 PM…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Week
                <select value={week} onChange={(e) => setWeek(e.target.value)}>
                  <option value="current">Upcoming week</option>
                  <option value="">All weeks</option>
                  {[...new Set(rows.map((r) => r.game.week).filter(Boolean))]
                    .sort((a, b) => a! - b!)
                    .map((w) => (
                      <option key={w} value={w}>
                        Week {w}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div
              className="slate-windows"
              role="group"
              aria-label="Filter game window"
            >
              {["All games", ...groups].map((window) => (
                <button
                  key={window}
                  aria-pressed={windowFilter === window}
                  className={windowFilter === window ? "selected" : ""}
                  onClick={() => setWindowFilter(window)}
                >
                  {window}
                </button>
              ))}
            </div>
            <p className="slate-count" role="status">
              {filtered.length} {filtered.length === 1 ? "matchup" : "matchups"}
              {query ? ` matching “${query}”` : " on your board"}
            </p>
            {!desk.access?.allowed && (
              <p className="mi-access">
                <Link href="/membership">Sign in or get research access</Link>{" "}
                to see analyst projections, targets and history.
              </p>
            )}
            {ranked.length > 0 && (
              <details className="admin-section">
                <summary>
                  Top Vegas Quant targets · analyst-ranked watchlist
                </summary>
                <p className="muted">
                  Informational targets. No bankroll or record impact.
                </p>
                {ranked.map(({ t, r }, i) => (
                  <Link
                    className="mi-watch"
                    key={i}
                    href={`/matchups/${r.game.slug}`}
                  >
                    #{t.rank} {t.selection} <Badge>{t.status}</Badge>
                  </Link>
                ))}
              </details>
            )}
            {groups.map((g) => {
              const list = filtered.filter((r) => group(r) === g);
              return list.length ? (
                <section key={g} className="mi-group">
                  <h2>{g}</h2>
                  <div className="mi-grid">
                    {list.map((r) => (
                      <Link
                        className="mi-game"
                        key={r.game.id}
                        href={`/matchups/${r.game.slug}`}
                      >
                        <span className="eyebrow">
                          {r.game.season || "NFL"}{" "}
                          {r.game.week ? `· Week ${r.game.week}` : ""}
                        </span>
                        <div className="game-pair" aria-hidden="true">
                          <strong>
                            {r.game.away_abbreviation ||
                              r.game.away_team.split(" ").at(-1)}
                          </strong>
                          <span>@</span>
                          <strong>
                            {r.game.home_abbreviation ||
                              r.game.home_team.split(" ").at(-1)}
                          </strong>
                        </div>
                        <h3>
                          {r.game.away_team} @ {r.game.home_team}
                        </h3>
                        <p>
                          {r.game.kickoff_tbd
                            ? "Kickoff time TBD"
                            : time(r.game.kickoff)}
                        </p>
                        <Badge>
                          {r.analysis?.intelligence?.status ||
                            (r.official
                              ? "OFFICIAL PLAY"
                              : r.analysis
                                ? "INITIAL ANALYSIS"
                                : r.research_available
                                  ? "RESEARCH AVAILABLE · MEMBERS"
                                  : r.research_available === undefined
                                    ? "CHECKING RESEARCH"
                                    : "NOT ANALYZED")}
                        </Badge>
                        {r.market && (
                          <p>
                            Last recorded: {r.market.spread || "—"} · Total{" "}
                            {r.market.total || "—"}
                            <small>{time(r.market.observed_at)}</small>
                          </p>
                        )}
                        {r.analysis && (
                          <>
                            <p>
                              Vegas Quant:{" "}
                              {String(
                                r.analysis.intelligence?.model?.true_spread ||
                                  r.analysis.projections?.["True Spread"] ||
                                  "Not supplied",
                              )}
                            </p>
                            {r.analysis.intelligence?.targets?.[0] && (
                              <p>
                                Target:{" "}
                                {r.analysis.intelligence.targets[0].selection}
                              </p>
                            )}
                            <small>
                              Analysis updated {time(r.analysis.created_at)}
                            </small>
                          </>
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null;
            })}
            {!filtered.length && (
              <Empty title="No matching games">
                Try a team name, abbreviation or another week.
              </Empty>
            )}
          </>
        ) : (
          <>
            <Link href="/matchups">← All matchups</Link>
            <details className="admin-section">
              <summary>Game details</summary>
              <Fields
                value={{
                  venue: row.game.venue,
                  surface: row.game.surface,
                  roof: row.game.roof,
                  division_game: row.game.division_game,
                  rest_differential: row.game.rest_differential,
                  travel: row.game.travel,
                }}
              />
            </details>
            {!desk.access?.allowed ? (
              <Empty title="Your research desk is waiting">
                <Link href="/membership">
                  Sign in or choose a research pass →
                </Link>
              </Empty>
            ) : (
              <>
                <div className="mi-status">
                  <Badge tone={official.length ? "green" : "muted"}>
                    {intel?.status ||
                      (official.length
                        ? "OFFICIAL PLAY"
                        : current
                          ? "INITIAL ANALYSIS"
                          : row?.research_available
                            ? "RESEARCH AVAILABLE · MEMBERS"
                            : row?.research_available === undefined
                              ? "CHECKING RESEARCH"
                              : "NOT ANALYZED")}
                  </Badge>
                  {current && <span>Updated {time(current.created_at)}</span>}
                </div>
                {current && (
                  <>
                    <h2>{intel?.summary || current.title}</h2>
                    {intel?.next_review && (
                      <p>Next scheduled review: {intel.next_review}</p>
                    )}
                    {selected && current.id !== versions[0]?.id && (
                      <p role="status" className="mi-historical">
                        Historical version {current.version}. Prices and targets
                        below are from that version.
                      </p>
                    )}
                    {intel?.what_changed && (
                      <Panel title="What changed">
                        <div className="notebook">
                          <p className="preserve">{intel.what_changed}</p>
                          <h3>Vegas Quant response</h3>
                          <p className="preserve">{intel.response}</p>
                          {intel.what_unchanged && (
                            <p>Unchanged: {intel.what_unchanged}</p>
                          )}
                        </div>
                      </Panel>
                    )}
                  </>
                )}
                {official.map((p) => (
                  <PickCard
                    key={p.id}
                    p={p}
                    d={desk}
                    allowShare={Boolean(desk.access?.admin)}
                    compact
                    personalPath
                  />
                ))}
                {intel ? (
                  <>
                    {intel.targets?.[0] && (
                      <Panel title="Top target · informational">
                        <div className="notebook">
                          <h3>{intel.targets[0].selection}</h3>
                          <Badge>{intel.targets[0].status}</Badge>
                          <p>{intel.targets[0].what_we_are_waiting_for}</p>
                        </div>
                      </Panel>
                    )}
                    <ResearchSections
                      sections={[
                        ["Market", intel.market],
                        ["Model", intel.model],
                        ["Injuries", intel.injuries],
                        ["Matchup", intel.teams],
                        ["Weather", intel.weather],
                        ["Vegas", intel.vegas],
                        ["Bias check", intel.bias],
                      ].map(([name, value]) => ({
                        title: String(name),
                        content: (
                          <>
                            {name === "Market" && (
                              <p className="muted">
                                Saved analyst snapshot; not a live quote.
                              </p>
                            )}
                            <Fields value={value} />
                          </>
                        ),
                      }))}
                    />
                    <details className="mi-section">
                      <summary>
                        Vegas Quant Target Board · {intel.targets?.length || 0}
                      </summary>
                      <p className="muted">
                        Targets are informational. Only explicitly published
                        official picks enter challenge records.
                      </p>
                      {intel.targets?.map((t, i) => (
                        <TargetCard key={i} target={t} />
                      ))}
                    </details>
                  </>
                ) : current ? (
                  <ResearchNotebook
                    analysis={current}
                    slug={row.game.slug}
                    official={official.length > 0}
                  />
                ) : (
                  <Empty title="Not analyzed yet">
                    No Vegas Quant analysis has been published for this game.
                  </Empty>
                )}
                <SourceObservations gameId={row.game.id} />
                <details className="mi-section">
                  <summary>
                    Market snapshots ·{" "}
                    {
                      desk.markets.filter((m) => m.game_id === row.game.id)
                        .length
                    }
                  </summary>
                  {desk.markets
                    .filter((m) => m.game_id === row.game.id)
                    .map((m) => (
                      <div className="mi-item" key={m.id}>
                        <SourceStatus
                          source={m.source}
                          at={m.observed_at}
                          historical
                          kind="Market observation"
                        />
                        <Fields
                          value={{
                            spread: m.spread,
                            moneyline: m.moneyline,
                            total: m.total,
                            notes: m.notes,
                          }}
                        />
                      </div>
                    ))}
                </details>
                <details className="mi-section">
                  <summary>Update history · {versions.length} versions</summary>
                  {versions.map((a) => (
                    <button
                      className="mi-version"
                      key={a.id}
                      onClick={() => {
                        setSelected(a.id);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      <span>
                        {time(a.created_at)} · v{a.version}
                      </span>
                      <strong>{a.intelligence?.update_type || a.title}</strong>
                      <span>{a.intelligence?.what_changed}</span>
                    </button>
                  ))}
                  {selected && (
                    <button
                      className="secondary"
                      onClick={() => setSelected("")}
                    >
                      Back to latest
                    </button>
                  )}
                </details>
              </>
            )}
          </>
        )}
      </Shell>
    </div>
  );
}
