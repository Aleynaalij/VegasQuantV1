"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import FollowButton from "./follow-button";
import Link from "next/link";
import type { Access } from "@/lib/membership";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time, type Desk } from "@/lib/domain";
import {
  searchMatchup,
  type DirectoryRow,
  type MatchupAnalysis,
  type Target,
} from "@/lib/matchups";
import { Shell, Badge, Panel, Empty } from "./ui";
import SourceObservations from "./source-observations";
import GameNews from "./game-news";
import GameThread from "./game-thread";
import ZoneNav from "./zone-nav";
import PickCard from "./pick-card";
import TeamLogo from "./team-logo";
import ResearchSections from "./research-sections";
import { researchFacts } from "@/lib/research-facts";
import ResearchNotebook from "./research-notebook";
import SourceStatus from "./source-status";
import { gamePicksPath } from "@/lib/game-picks";
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
/** A research topic as readable facts, in the lounge card style. */
function Facts({ groups }: { groups: ReturnType<typeof researchFacts> }) {
  return (
    <div className="mi-facts">
      {groups.map((facts, i) => (
        <dl key={i}>
          {facts.map((f, j) =>
            f.kind === "note" ? (
              <p key={j} className="mi-fact-note">
                {f.value}
              </p>
            ) : (
              <div
                key={j}
                className={
                  f.kind !== "time" && f.value.length > 16 ? "wide" : ""
                }
              >
                {f.label && <dt>{f.label}</dt>}
                <dd>
                  {f.kind === "link" ? (
                    <a href={f.value} target="_blank" rel="noopener noreferrer">
                      {f.host} ↗
                    </a>
                  ) : f.kind === "time" ? (
                    time(f.value)
                  ) : (
                    f.value
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      ))}
    </div>
  );
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
    [sort, setSort] = useState("kickoff"),
    [futureOnly, setFutureOnly] = useState(true),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [signedIn, setSignedIn] = useState(false),
    [retry, setRetry] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q.slice(0, 160));
  }, []);
  useEffect(() => {
    let live = true,
      busy = false;
    setLoading(true);
    async function refresh() {
      if (busy || !live) return;
      busy = true;
      const n = ++epoch.current;
      try {
        // Resolve the persisted session before checking access. Never infer denial from
        // the anonymous server render or from a failed research download.
        const session = await supabase.auth.getSession();
        if (session.error)
          throw Error("Your session could not be checked. Please retry.");
        if (!live || n !== epoch.current) return;
        setSignedIn(!!session.data.session);
        const signal = AbortSignal.timeout(20000);
        const [directory, access, publicStatus] = await Promise.all([
          supabase.rpc("matchup_directory").abortSignal(signal),
          supabase.rpc("membership_status").abortSignal(signal),
          supabase.rpc("public_research_status").abortSignal(signal),
        ]);
        if (access.error || typeof access.data?.allowed !== "boolean")
          throw Error("Research access could not be checked. Please retry.");
        if (directory.error)
          throw Error("The game directory could not load. Please retry.");
        if (!live || n !== epoch.current) return;
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
        const game = directory.data.find(
          (r: DirectoryRow) => r.game.slug === slug,
        )?.game;
        const base = {
          ...initial,
          access: access.data,
          analyses: [],
          markets: [],
          picks: [],
          entries: [],
          closings: [],
          results: [],
          reviews: [],
          transactions: [],
        };
        if (!access.data?.allowed || !game) {
          setDesk(base);
        } else {
          // Only this game's history is needed here. desk_data also downloads every
          // other game's history, all price snapshots and the entire audit trail.
          // These reads retain the existing table RLS and membership checks.
          const [analyses, markets, picks] = await Promise.all([
            supabase
              .from("analysis_versions")
              .select(
                "id,game_id,version,title,sections,projections,source,created_at,intelligence",
              )
              .eq("game_id", game.id)
              .order("version", { ascending: false })
              .abortSignal(signal),
            supabase
              .from("market_snapshots")
              .select("*")
              .eq("game_id", game.id)
              .order("observed_at", { ascending: false })
              .abortSignal(signal),
            supabase
              .from("official_picks")
              .select("*")
              .eq("game_id", game.id)
              .order("created_at", { ascending: false })
              .abortSignal(signal),
          ]);
          if (analyses.error || markets.error || picks.error)
            throw Error("This game's research could not load. Please retry.");
          if (!live || n !== epoch.current) return;
          if (
            !analyses.data.length &&
            publicStatus.data?.games?.some(
              (g: { game_id: string }) => g.game_id === game.id,
            )
          )
            throw Error(
              "Published research could not be retrieved for this game. Please retry.",
            );
          const related = {
            entries: [] as Desk["entries"],
            closings: [] as Desk["closings"],
            results: [] as Desk["results"],
            reviews: [] as Desk["reviews"],
            transactions: [] as Desk["transactions"],
          };
          const pickIds = picks.data.map((p) => p.id);
          if (pickIds.length) {
            const [entries, closings, results, reviews, transactions] =
              await Promise.all([
                supabase
                  .from("pick_entries")
                  .select("*")
                  .in("pick_id", pickIds)
                  .order("created_at", { ascending: false })
                  .abortSignal(signal),
                supabase
                  .from("closing_lines")
                  .select("*")
                  .in("pick_id", pickIds)
                  .order("created_at", { ascending: false })
                  .abortSignal(signal),
                supabase
                  .from("pick_results")
                  .select("*")
                  .in("pick_id", pickIds)
                  .order("created_at", { ascending: false })
                  .abortSignal(signal),
                supabase
                  .from("process_reviews")
                  .select("*")
                  .in("pick_id", pickIds)
                  .order("created_at", { ascending: false })
                  .abortSignal(signal),
                supabase
                  .from("bankroll_transactions")
                  .select("*")
                  .in("pick_id", pickIds)
                  .order("created_at", { ascending: false })
                  .abortSignal(signal),
              ]);
            if (
              [entries, closings, results, reviews, transactions].some(
                (r) => r.error,
              )
            )
              throw Error(
                "This game's pick records could not refresh. Please retry.",
              );
            if (!live || n !== epoch.current) return;
            Object.assign(related, {
              entries: entries.data,
              closings: closings.data,
              results: results.data,
              reviews: reviews.data,
              transactions: transactions.data,
            });
          }
          setDesk({
            ...base,
            ...related,
            analyses: analyses.data.map((a) => ({ ...a, raw_handoff: "" })),
            markets: markets.data,
            picks: picks.data,
          } as Desk & { access?: Access });
        }
        setError("");
      } catch (e) {
        if (live && n === epoch.current)
          setError(
            e instanceof Error
              ? e.message
              : "Research could not load. Please retry.",
          );
      } finally {
        if (live && n === epoch.current) {
          busy = false;
          setLoading(false);
        }
      }
    }
    void refresh();
    const stopAuth = onUserChange(() => {
      ++epoch.current;
      busy = false;
      setRows(
        initial.games.map((game) => ({ game, analysis: null, market: null })),
      );
      setDesk(initial);
      setSelected("");
      setLoading(true);
      setError("");
      setTimeout(() => void refresh(), 0);
    });
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      ++epoch.current;
      stopAuth();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [initial, slug, retry]);
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
    "International",
    "Thursday",
    "Sunday Early",
    "Sunday Late",
    "Sunday Night",
    "Monday Night",
    "Other",
  ];
  function group(r: DirectoryRow) {
    const slot = r.game.slot.toLowerCase();
    if (slot.includes("international")) return "International";
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
      (!futureOnly || Date.parse(r.game.kickoff) > Date.now()) &&
      (windowFilter === "All games" || group(r) === windowFilter) &&
      (!week ||
        (week === "current" && currentWeek == null
          ? Date.parse(r.game.kickoff) > Date.now() &&
            Date.parse(r.game.kickoff) <= Date.now() + 7 * 86400000
          : String(r.game.week) ===
            (week === "current" ? String(currentWeek) : week))),
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
        <ZoneNav active="Games" />
        <div className="heading">
          <div>
            <span className="eyebrow">VEGAS QUANT INTELLIGENCE</span>
            <h1>
              {row
                ? `${row.game.away_abbreviation || row.game.away_team} @ ${row.game.home_abbreviation || row.game.home_team}`
                : "The Zone · Games"}
            </h1>
            <p>
              {row
                ? `${time(row.game.kickoff)} · ${row.game.venue}`
                : "Choose your game for the case, injury updates, sources and discussion."}
            </p>
            {row && <Link className="vq-btn" href={gamePicksPath(row.game.slug)}>View all game picks →</Link>}
            {row && (
              <div className="follow-row" aria-label="Follow these teams">
                <FollowButton
                  topic={row.game.away_team}
                  label={row.game.away_team.split(" ").at(-1)}
                />
                <FollowButton
                  topic={row.game.home_team}
                  label={row.game.home_team.split(" ").at(-1)}
                />
              </div>
            )}
          </div>
        </div>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button
              className="secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry research
            </button>
          </div>
        )}
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
            {!loading && !error && !desk.access?.allowed && (
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
            <div className="analysis-tools">
              <label>
                Sort by
                <select
                  aria-label="Sort matchups"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="kickoff">Kickoff time</option>
                  <option value="updated">Latest research</option>
                </select>
              </label>
              <button
                className="secondary"
                aria-pressed={futureOnly}
                onClick={() => setFutureOnly((v) => !v)}
              >
                {futureOnly ? "Upcoming only ✓" : "Upcoming only"}
              </button>
            </div>
            {groups.map((g) => {
              const list = filtered
                .filter(
                  (r) =>
                    group(r) === g &&
                    (!futureOnly || Date.parse(r.game.kickoff) > Date.now()),
                )
                .sort((a, b) =>
                  sort === "updated"
                    ? Date.parse(
                        b.analysis?.created_at ||
                          b.research_updated_at ||
                          "1970-01-01",
                      ) -
                      Date.parse(
                        a.analysis?.created_at ||
                          a.research_updated_at ||
                          "1970-01-01",
                      )
                    : Date.parse(a.game.kickoff) - Date.parse(b.game.kickoff),
                );
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
                          <TeamLogo team={r.game.away_team} size={48} />
                          <strong>
                            {r.game.away_abbreviation ||
                              r.game.away_team.split(" ").at(-1)}
                          </strong>
                          <span>@</span>
                          <TeamLogo team={r.game.home_team} size={48} />
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
                        <span className="mi-card-action">
                          Open game research <span aria-hidden="true">↗</span>
                        </span>
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
            {loading && !current ? (
              <p role="status">Loading game research…</p>
            ) : error && !current ? (
              <Empty title="Research could not load">
                Use Retry research above to reconnect.
              </Empty>
            ) : !desk.access?.allowed ? (
              <Empty
                title={
                  signedIn
                    ? "Check your research access"
                    : "Sign in to view game research"
                }
              >
                <span>
                  {signedIn
                    ? "Your account is signed in. Check your research pass and account verification in Account."
                    : "Published research is available with an active research pass."}
                </span>
                <br />
                <Link href="/membership">
                  {signedIn
                    ? "Check account access →"
                    : "Sign in or choose a research pass →"}
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
                    <h2>{intel?.summary || "Matchup briefing"}</h2>
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
                      ]
                        .map(([name, value]) => ({
                          name: String(name),
                          groups: researchFacts(value),
                        }))
                        // Topics with nothing a member can use are left out.
                        .filter((t) => t.groups.length)
                        .map(({ name, groups }) => ({
                          title: name,
                          content: (
                            <>
                              {name === "Market" && (
                                <p className="muted">
                                  Saved analyst snapshot; not a live quote.
                                </p>
                              )}
                              <Facts groups={groups} />
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
                    versions={versions}
                    slug={row.game.slug}
                    official={official.length > 0}
                  />
                ) : (
                  <Empty title="Not analyzed yet">
                    No Vegas Quant analysis has been published for this game.
                  </Empty>
                )}
                <GameNews
                  gameId={row.game.id}
                  before={
                    selected && current?.id !== versions[0]?.id
                      ? current?.created_at
                      : undefined
                  }
                />
                <SourceObservations
                  gameId={row.game.id}
                  before={
                    selected && current?.id !== versions[0]?.id
                      ? current?.created_at
                      : undefined
                  }
                />
                {desk.markets.some((m) => m.game_id === row.game.id) && (
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
                )}
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
        {row && <GameThread gameId={row.game.id} />}
      </Shell>
    </div>
  );
}
