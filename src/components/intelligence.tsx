"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clv, emptyDesk, lineText, odd, time, type Desk } from "@/lib/domain";
import {
  books,
  consensus,
  latestByBook,
  newsContext,
  noVig,
  probabilityOdds,
  retailBooks,
  sections,
  sharpBooks,
  type IntelMarket,
  type Model,
  type News,
  type Quote,
  type Split,
} from "@/lib/intelligence";
import { Badge, Empty, Panel, Shell, SourceLink, Stat } from "./ui";
import IntelligenceEntry from "./intelligence-entry";
const pct = (n: number | null) =>
  n === null ? "—" : `${(n * 100).toFixed(2)}%`;
const price = (p: number | null) => {
  const o = p === null ? null : probabilityOdds(p);
  return o === null ? "—" : odd(Math.round(o));
};
const markLine = (n: number | null) => (n === null ? "ML" : String(n));
function Stamp({
  row,
}: {
  row: {
    source: string;
    observed_at: string;
    time_basis?: string;
    created_at: string;
  };
}) {
  return (
    <small className="intel-stamp">
      <time dateTime={row.observed_at}>{time(row.observed_at)}</time> ·{" "}
      {row.time_basis || "analyst snapshot"} ·{" "}
      <SourceLink href={row.source}>{row.source}</SourceLink>
      <span>Recorded {time(row.created_at)}</span>
    </small>
  );
}
type Timed = { id: string; observed_at: string; created_at: string };
function useTape<T extends Timed>(
  table: string,
  column: string,
  id: string,
  asOf: string,
  revision: number,
) {
  const [rows, setRows] = useState<T[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const epoch = useRef(0);
  const fetchPage = useCallback(
    async (reset: boolean, existing: T[]) => {
      const run = epoch.current;
      if (!id) return;
      setBusy(true);
      setError("");
      try {
        let q = supabase
          .from(table)
          .select("*", { count: "exact" })
          .eq(column, id)
          .lte("observed_at", asOf)
          .order("observed_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(200);
        const last = existing.at(-1);
        if (!reset && last)
          q = q.or(
            `observed_at.lt.${last.observed_at},and(observed_at.eq.${last.observed_at},id.lt.${last.id})`,
          );
        const r = await q;
        if (r.error) throw r.error;
        if (run !== epoch.current) return;
        const data = r.data as T[];
        setRows(reset ? data : [...existing, ...data]);
        if (reset) setTotal(r.count || 0);
      } catch (e) {
        if (run === epoch.current) setError((e as { message: string }).message);
      } finally {
        if (run === epoch.current) setBusy(false);
      }
    },
    [table, column, id, asOf, revision],
  );
  useEffect(() => {
    epoch.current++;
    setRows([]);
    setTotal(0);
    setError("");
    setBusy(false);
    void fetchPage(true, []);
    return () => {
      epoch.current++;
    };
  }, [fetchPage]);
  return {
    rows,
    total,
    busy,
    error,
    more: () => void fetchPage(false, rows),
    complete: rows.length >= total,
  };
}
function TapeFooter({
  tape,
}: {
  tape: {
    rows: Timed[];
    total: number;
    busy: boolean;
    error: string;
    more: () => void;
  };
}) {
  return (
    <div className="intel-footer">
      {tape.error ? (
        <p role="alert">Unable to load records: {tape.error}</p>
      ) : (
        <span>
          {tape.rows.length} of {tape.total} records loaded
        </span>
      )}
      {tape.rows.length < tape.total && (
        <button className="secondary" disabled={tape.busy} onClick={tape.more}>
          {tape.busy ? "Loading…" : "Load older records"}
        </button>
      )}
    </div>
  );
}
export default function Intelligence() {
  const [desk, setDesk] = useState<Desk | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      epoch = 0;
    async function check() {
      const run = ++epoch;
      setDesk(null);
      setChecking(true);
      setError("");
      try {
        const admin = await supabase.rpc("is_admin");
        if (admin.error || admin.data !== true) return;
        const d = await supabase.rpc("desk_data");
        if (d.error) throw d.error;
        if (active && run === epoch) setDesk(d.data);
      } catch (e) {
        if (active && run === epoch)
          setError((e as { message: string }).message);
      } finally {
        if (active && run === epoch) setChecking(false);
      }
    }
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setDesk(null);
      setTimeout(() => {
        if (active) void check();
      }, 0);
    });
    return () => {
      active = false;
      epoch++;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Shell active="intelligence">
      {desk ? (
        <IntelligenceWorkspace desk={desk} />
      ) : (
        <Panel title="Private Data Intelligence">
          <div className="notebook">
            <h1>
              {checking
                ? "Checking admin access…"
                : "Verified admin access required"}
            </h1>
            <p>
              {error ||
                "This workspace is private. Sign in with your approved admin account and complete two-step verification."}
            </p>
            {!checking && (
              <Link className="primary" href="/membership">
                Sign in / verify →
              </Link>
            )}
          </div>
        </Panel>
      )}
    </Shell>
  );
}
function IntelligenceWorkspace({ desk: d }: { desk: Desk }) {
  const [gameId, setGameId] = useState(d.games[0]?.id || ""),
    [markets, setMarkets] = useState<IntelMarket[]>([]),
    [marketId, setMarketId] = useState(""),
    [section, setSection] = useState<string>(sections[0]),
    [book, setBook] = useState("All"),
    [line, setLine] = useState<string>(""),
    [asOf, setAsOf] = useState(() => new Date().toISOString()),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    setMarkets([]);
    supabase
      .from("intelligence_markets")
      .select("*")
      .eq("game_id", gameId)
      .order("label")
      .then((r) => {
        if (!live) return;
        if (r.error) {
          setError(r.error.message);
          return;
        }
        setError("");
        setMarkets(r.data);
        setMarketId((current) =>
          r.data.some((m) => m.id === current) ? current : r.data[0]?.id || "",
        );
      });
    return () => {
      live = false;
    };
  }, [gameId, revision]);
  const market = markets.find((m) => m.id === marketId);
  const quotes = useTape<Quote>(
      "intelligence_quotes",
      "market_id",
      market?.id || "",
      asOf,
      revision,
    ),
    splits = useTape<Split>(
      "intelligence_splits",
      "market_id",
      market?.id || "",
      asOf,
      revision,
    ),
    news = useTape<News>(
      "intelligence_news",
      "game_id",
      gameId,
      asOf,
      revision,
    ),
    models = useTape<Model>(
      "intelligence_models",
      "market_id",
      market?.id || "",
      asOf,
      revision,
    );
  useEffect(() => setLine(""), [marketId]);
  const at = Date.parse(asOf),
    lines = [...new Set(quotes.rows.map((q) => markLine(q.line)))],
    selectedLine = line || lines[0] || "ML",
    numericLine = selectedLine === "ML" ? null : Number(selectedLine);
  const sharp = consensus(quotes.rows, sharpBooks, numericLine, at),
    retail = consensus(quotes.rows, retailBooks, numericLine, at),
    allQuotesComplete = quotes.complete && !quotes.error && !quotes.busy;
  const model = models.rows[0],
    modelComparable =
      model &&
      model.probability_line === numericLine &&
      at - Date.parse(model.observed_at) <= 6 * 3600000;
  const visibleQuotes = quotes.rows
    .filter(
      (q) =>
        (book === "All" || q.book === book) &&
        (!search ||
          `${q.book} ${q.source} ${q.notes}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.observed_at) - Date.parse(b.observed_at) ||
        Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  const [visibleCount, setVisibleCount] = useState(25);
  useEffect(
    () => setVisibleCount(25),
    [section, gameId, marketId, book, search],
  );
  function refresh() {
    setAsOf(new Date().toISOString());
    setRevision((x) => x + 1);
  }
  const options = [
    ...new Set([
      ...books,
      ...quotes.rows.map((q) => q.book),
      ...splits.rows.map((q) => q.book),
    ]),
  ];
  function ConsensusPanel({ retailView = false }: { retailView?: boolean }) {
    const c = retailView ? retail : sharp,
      group = retailView ? retailBooks : sharpBooks;
    return (
      <Panel
        title={retailView ? "Retail Consensus" : "Sharp Consensus"}
        aside={
          <Badge>
            {c.eligible.length}/{group.length} books
          </Badge>
        }
      >
        <div className="notebook">
          <p>
            {retailView
              ? "DraftKings / FanDuel / BetMGM"
              : "Configured market-maker references: Circa / Pinnacle / Bookmaker"}
            . {market?.selection} at {selectedLine}. Only matching observed
            quotes from the prior 15 minutes qualify.
          </p>
          <div className="stats">
            <Stat
              label="No-vig fair probability"
              value={allQuotesComplete ? pct(c.fairProbability) : "—"}
            />
            <Stat
              label="No-vig fair American price"
              value={allQuotesComplete ? price(c.fairProbability) : "—"}
            />
            {retailView && (
              <Stat
                label="Average raw implied probability"
                value={allQuotesComplete ? pct(c.rawProbability) : "—"}
                note="Includes bookmaker margin"
              />
            )}
          </div>
          {(!allQuotesComplete || c.paired.length < 2) && (
            <p className="warning-box">
              {!allQuotesComplete
                ? "Load all quote records to verify the latest observation for each book."
                : "At least two fresh books with both opposite prices are required. No consensus inferred."}
            </p>
          )}
          {c.missing.length > 0 && (
            <p className="muted">
              Missing, stale, different-line or unknown observation time:{" "}
              {c.missing.join(", ")}.
            </p>
          )}
          {c.latest.map((q) => {
            const n = noVig(q.odds, q.opposite_odds),
              eligible = c.eligible.some((x) => x.id === q.id);
            return (
              <article className="intel-row" key={q.id}>
                <strong>
                  {q.book} · {markLine(q.line)} · {odd(q.odds)} /{" "}
                  {q.opposite_odds === null
                    ? "Opposite missing"
                    : odd(q.opposite_odds)}
                </strong>
                <p>
                  {eligible
                    ? "Eligible observation"
                    : "Excluded from consensus"}{" "}
                  ·{" "}
                  {eligible && n
                    ? `${pct(n.probability)} no-vig · ${n.margin.toFixed(2)}% overround`
                    : "Not a complete comparable pair"}
                </p>
                <Stamp row={q} />
              </article>
            );
          })}
          <details>
            <summary>Calculation method</summary>
            <p>
              Convert each opposite American price to implied probability.
              Divide the selected probability by the sum of both probabilities.
              Average those fair probabilities equally across eligible books,
              then convert back to American odds. Minimum two complete books.
              This is a proportional two-outcome estimate, conditional on no
              push/void, not a model forecast. Different periods, settlement
              rules, lines and selections must use separate market records. Raw
              retail averages use implied probability, never arithmetic averages
              of American odds.
            </p>
          </details>
        </div>
        <TapeFooter tape={quotes} />
      </Panel>
    );
  }
  return (
    <>
      <div className="heading">
        <div>
          <span className="eyebrow">PRIVATE · VERIFIED ADMINS</span>
          <h1>Data Intelligence</h1>
          <p>Source records, comparisons and execution quality.</p>
        </div>
        <Link className="secondary" href="/admin">
          Publishing desk →
        </Link>
      </div>
      <div className="intel-controls">
        <label className="field">
          Section
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Game
          <select
            value={gameId}
            onChange={(e) => {
              setGameId(e.target.value);
              setMarketId("");
            }}
          >
            {d.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.away_team} @ {g.home_team}
              </option>
            ))}
          </select>
        </label>
        {section !== "CLV Tracker" && (
          <label className="field">
            Indexed market
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
            >
              <option value="">Select / add a market</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.period}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="intel-asof">
        <span>
          Source data as of {time(asOf)} · manual research + source feeds
        </span>
        <button className="text-link" onClick={refresh}>
          Refresh records
        </button>
      </div>
      <details className="admin-section">
        <summary>Historical view / source coverage</summary>
        <div className="notebook">
          <label className="field">
            As-of source timestamp (your local time)
            <input
              type="datetime-local"
              onChange={(e) => {
                const n = Date.parse(e.target.value);
                if (Number.isFinite(n) && n <= Date.now())
                  setAsOf(new Date(n).toISOString());
              }}
            />
          </label>
          <p>
            Manual / owner-supplied records. Received or publication timestamps
            are labeled separately and never treated as live quote observations.
            Source-feed health and automated observations are available in Data feed health. Betting splits and analyst adjustments require supplied data.
            Historical views use source timestamps and are not a proof of what
            the website knew at that moment.
          </p>
          {market && (
            <p>
              {market.selection} / {market.opposite} · {market.period} · Rules:{" "}
              {market.rules}
            </p>
          )}
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      {section !== "CLV Tracker" && (
        <IntelligenceEntry gameId={gameId} market={market} onSaved={refresh} />
      )}
      {["Market Tape", "Public vs Sharp", "News Tape"].includes(section) && (
        <label className="field">
          Sportsbook filter
          <select value={book} onChange={(e) => setBook(e.target.value)}>
            <option>All</option>
            {options.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      )}
      {["Sharp Consensus", "Retail Consensus", "Model vs Market"].includes(
        section,
      ) && (
        <label className="field">
          Compare the same line
          <select
            value={selectedLine}
            onChange={(e) => setLine(e.target.value)}
          >
            {(lines.length ? lines : ["ML"]).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
      {section === "Market Tape" && (
        <Panel title="Market Tape" aside={<Badge>Oldest → newest</Badge>}>
          <div className="notebook">
            <label className="field">
              Find a source, book or note
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="search"
              />
            </label>
            {!visibleQuotes.length && (
              <Empty title="No matching observations">
                Add sourced prices using Add private data. Unknown timestamps
                and missing opposite prices remain explicit.
              </Empty>
            )}
            {visibleQuotes.slice(-visibleCount).map((q) => {
              const previous = visibleQuotes
                .filter(
                  (x) =>
                    x.book === q.book &&
                    Date.parse(x.observed_at) < Date.parse(q.observed_at),
                )
                .at(-1);
              return (
                <article className="intel-row" key={q.id}>
                  <strong>
                    {q.book} · {market?.selection} {markLine(q.line)} ·{" "}
                    {odd(q.odds)}
                  </strong>
                  <p>
                    Opposite:{" "}
                    {q.opposite_odds === null
                      ? "Not supplied"
                      : odd(q.opposite_odds)}
                    {previous
                      ? ` · Prior: ${markLine(previous.line)} ${odd(previous.odds)}`
                      : " · First loaded observation"}
                  </p>
                  <Stamp row={q} />
                  {q.notes && (
                    <details>
                      <summary>Source note</summary>
                      <p>{q.notes}</p>
                    </details>
                  )}
                </article>
              );
            })}
            {visibleQuotes.length > visibleCount && (
              <button
                className="secondary"
                onClick={() => setVisibleCount((v) => v + 25)}
              >
                Show 25 earlier observations
              </button>
            )}
          </div>
          <TapeFooter tape={quotes} />
        </Panel>
      )}
      {section === "Sharp Consensus" && <ConsensusPanel />}
      {section === "Retail Consensus" && <ConsensusPanel retailView />}
      {section === "Public vs Sharp" && (
        <Panel title="Public vs Sharp">
          <div className="notebook">
            <p>
              Compare ticket share with handle share for the same selected
              outcome. Circa is displayed separately; larger wagers and line
              movement do not prove who placed them or why.
            </p>
            {!splits.rows.length && (
              <Empty title="No sourced ticket / handle data">
                No public or sharp percentages are invented from price movement.
              </Empty>
            )}
            {latestByBook(splits.rows, at)
              .filter((s) => book === "All" || s.book === book)
              .map((s) => (
                <article className="intel-row" key={s.id}>
                  <Badge tone={s.book === "Circa" ? "gold" : "muted"}>
                    {s.book === "Circa" ? "CIRCA COMPARISON" : s.book}
                  </Badge>
                  <h3>
                    {market?.selection} {markLine(s.line)}
                  </h3>
                  <p>
                    Tickets: {s.ticket_pct ?? "—"}% · Handle:{" "}
                    {s.handle_pct ?? "—"}% · Difference:{" "}
                    {s.ticket_pct !== null && s.handle_pct !== null
                      ? `${(s.handle_pct - s.ticket_pct).toFixed(1)} pp`
                      : "—"}
                  </p>
                  <p>
                    Sample: {s.sample_size ?? "size not supplied"} ·{" "}
                    {s.sample_window}
                  </p>
                  <Stamp row={s} />
                  {at - Date.parse(s.observed_at) > 900000 && (
                    <p className="muted">
                      Older than 15 minutes at the selected as-of time.
                    </p>
                  )}
                </article>
              ))}
            <p className="muted">
              Compare only matching lines, time windows and populations.
              Percentages from different books are not pooled.
            </p>
          </div>
          <TapeFooter tape={splits} />
        </Panel>
      )}
      {section === "Model vs Market" && (
        <Panel title="Model vs Market">
          <div className="notebook">
            {model ? (
              <>
                <h3>{model.projection}</h3>
                <div className="stats">
                  <Stat
                    label="Analyst true line"
                    value={model.true_line ?? "Range / not supplied"}
                  />
                  <Stat
                    label="Supplied sharp fair line"
                    value={model.sharp_fair_line ?? "Not supplied"}
                  />
                  <Stat
                    label="Sharp no-vig probability at selected line"
                    value={allQuotesComplete ? pct(sharp.fairProbability) : "—"}
                  />
                  <Stat
                    label="Model minus sharp probability"
                    value={
                      modelComparable &&
                      allQuotesComplete &&
                      model.probability !== null &&
                      sharp.fairProbability !== null
                        ? `${(model.probability - sharp.fairProbability * 100).toFixed(2)} pp`
                        : "Not comparable"
                    }
                  />
                </div>
                <p>
                  Model probability: {model.probability ?? "—"}% at{" "}
                  {markLine(model.probability_line)}.{" "}
                  {modelComparable
                    ? "Same line; model snapshot within 6 hours."
                    : "Different line or model snapshot over 6 hours old."}
                </p>
                <Stamp row={model} />
                {model.sharp_method && (
                  <p>Sharp fair-line source / method: {model.sharp_method}</p>
                )}
                <p>
                  A no-vig price at one line does not identify a fair spread or
                  total. A sharp fair line must be supplied with its own method;
                  it is never inferred by averaging different numbers.
                </p>
                <details>
                  <summary>
                    Previous model snapshots ({models.rows.length})
                  </summary>
                  {models.rows.map((m) => (
                    <article className="intel-row" key={m.id}>
                      <p>{m.projection}</p>
                      <Stamp row={m} />
                    </article>
                  ))}
                </details>
              </>
            ) : (
              <Empty title="No structured model snapshot">
                Add the exact analyst projection. Do not convert a supplied
                range into an invented point estimate.
              </Empty>
            )}
          </div>
          <TapeFooter tape={models} />
          <TapeFooter tape={quotes} />
        </Panel>
      )}
      {section === "News Tape" && (
        <Panel title="News Tape">
          <div className="notebook">
            <p>
              News alongside the nearest observed quotes within one hour before
              and after its timestamp. Timing shows sequence, not causation.
              Select a market to inspect its moves.
            </p>
            {!news.rows.length && (
              <Empty title="No news records">
                Add timestamped injury, weather or team news with a source.
              </Empty>
            )}
            {news.rows.slice(0, visibleCount).map((n) => (
              <article className="intel-row" key={n.id}>
                <Badge>{n.category}</Badge>
                <h3>{n.headline}</h3>
                <Stamp row={n} />
                <details>
                  <summary>Read news & price context</summary>
                  <p className="preserve">{n.body}</p>
                  {(book === "All"
                    ? [...new Set(quotes.rows.map((q) => q.book))]
                    : [book]
                  ).map((b) => {
                    const c = newsContext(n, quotes.rows, b);
                    return (
                      <p key={b}>
                        <b>{b}</b> · Before:{" "}
                        {c.before
                          ? `${markLine(c.before.line)} ${odd(c.before.odds)} (${time(c.before.observed_at)})`
                          : "No observation"}{" "}
                        → After:{" "}
                        {c.after
                          ? `${markLine(c.after.line)} ${odd(c.after.odds)} (${time(c.after.observed_at)})`
                          : "No observation"}
                      </p>
                    );
                  })}
                  {!quotes.rows.length && (
                    <p>No observed prices available for this market.</p>
                  )}
                </details>
              </article>
            ))}
            {news.rows.length > visibleCount && (
              <button
                className="secondary"
                onClick={() => setVisibleCount((v) => v + 25)}
              >
                Show 25 more
              </button>
            )}
          </div>
          <TapeFooter tape={news} />
          <TapeFooter tape={quotes} />
        </Panel>
      )}
      {section === "CLV Tracker" && <ClvTracker desk={d} />}
    </>
  );
}
function ClvTracker({ desk: d }: { desk: Desk }) {
  const [query, setQuery] = useState(""),
    [count, setCount] = useState(25);
  const picks = d.picks.filter((p) =>
    `${p.selection} ${d.games.find((g) => g.id === p.game_id)?.away_team} ${d.games.find((g) => g.id === p.game_id)?.home_team}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Panel title="CLV Tracker · all official wagers">
      <div className="notebook">
        <label className="field">
          Find an official wager
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCount(25);
            }}
          />
        </label>
        <p>
          Original recommendation → actual entry → closing line. Personal tail
          entries are separate. Missing execution never implies an actual wager.
        </p>
        {picks.slice(0, count).map((p) => {
          const e = d.entries.find((x) => x.pick_id === p.id),
            c = d.closings.find((x) => x.pick_id === p.id),
            v = clv(p, e, c),
            r = d.results.find((x) => x.pick_id === p.id);
          return (
            <article className="intel-row" key={p.id}>
              <Badge>{r?.result || "Pending result"}</Badge>
              <h3>{p.selection}</h3>
              <p>
                Published {time(p.created_at)} · {lineText(p.recommended_line)}{" "}
                {odd(p.odds)}
              </p>
              <p>
                Actual:{" "}
                {e ? `${lineText(e.line)} ${odd(e.odds)}` : "Not confirmed"} →
                Close:{" "}
                {c ? `${lineText(c.line)} ${odd(c.odds)}` : "Not recorded"}
              </p>
              <p>
                Price CLV:{" "}
                {v.price === null
                  ? "Not comparable / missing"
                  : `${v.price.toFixed(2)}%`}{" "}
                · Line CLV: {v.points === null ? "—" : `${v.points} points`}
              </p>
              {v.key && <p>{v.key}</p>}
              {e && <SourceLink href={e.source}>Entry source</SourceLink>}
              {c && (
                <p>
                  <SourceLink href={c.source}>Closing source</SourceLink> ·{" "}
                  {time(c.observed_at)}
                </p>
              )}
            </article>
          );
        })}
        {!picks.length && (
          <Empty title="No matching official wagers">
            Every published pick remains in the permanent ledger.
          </Empty>
        )}
        {picks.length > count && (
          <button className="secondary" onClick={() => setCount((n) => n + 25)}>
            Show 25 more
          </button>
        )}
        <Link className="text-link" href="/history">
          Open permanent ledger →
        </Link>
      </div>
    </Panel>
  );
}
