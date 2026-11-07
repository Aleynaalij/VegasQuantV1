"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "./ui";
import { onUserChange } from "@/lib/auth-user";
import {
  fearAccess,
  fearDetail,
  fearSchedule,
  supportedFearSport,
} from "@/lib/vegas-fear-reader";
import {
  bookWindowMinutes,
  fearSports,
  historyHours,
  marketKeys,
  markets,
  quoteAgeMinutes,
  type FearQuote,
} from "@/lib/vegas-fear";
import "@/app/vegas-fear/fear.css";

const dates = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const when = (time: number) => dates.format(time) + " ET";
const price = (value: number) => (value > 0 ? "+" + value : String(value));
const selection = (q: FearQuote) =>
  [q.player, q.selection].filter(Boolean).join(" · ");
const names = {
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  ncaab: "College basketball",
};

type Data = Awaited<ReturnType<typeof fearSchedule>> & {
  access: Awaited<ReturnType<typeof fearAccess>>;
  detail: Awaited<ReturnType<typeof fearDetail>> | null;
};

function Quote({ label, quote }: { label: string; quote: FearQuote }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {quote.line === null ? "" : `Line ${quote.line} · `}
        {price(quote.odds)}
      </dd>
      <dd>Observed {when(quote.observed)}</dd>
      <dd>Received {when(quote.received)}</dd>
      <dd>
        <a href={quote.source} target="_blank" rel="noreferrer">
          {quote.provider} source ↗
        </a>
      </dd>
    </div>
  );
}

export default function VegasFear() {
  const params = useSearchParams(),
    router = useRouter();
  const sport =
    fearSports.find((value) => value === params.get("sport")) || "nfl";
  const eventId = params.get("event") || "",
    market = params.get("market") || "";
  const request = JSON.stringify([sport, eventId]);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    request: string;
    data?: Data;
    error?: boolean;
  } | null>(null);
  const data = result?.request === request ? result.data : undefined;
  const error = result?.request === request && result.error;

  useEffect(() => {
    let live = true,
      generation = 0;
    let activeRead: AbortController | undefined;
    async function load() {
      const ticket = ++generation;
      activeRead?.abort();
      const controller = new AbortController();
      activeRead = controller;
      setResult(null);
      try {
        if (!supportedFearSport(sport)) return;
        const now = Date.now();
        const [access, schedule] = await Promise.all([
          fearAccess(),
          fearSchedule(sport, now),
        ]);
        if (!live || ticket !== generation) return;
        const event = schedule.events.find(
          (candidate) => candidate.id === eventId,
        );
        const detail =
          access === "allowed" && event && !event.tbd
            ? await fearDetail(event, now, undefined, controller.signal)
            : null;
        if (live && ticket === generation)
          setResult({ request, data: { ...schedule, access, detail } });
      } catch {
        if (live && ticket === generation) setResult({ request, error: true });
      }
    }
    void load();
    const stop = onUserChange(() => {
      void load();
    });
    return () => {
      live = false;
      activeRead?.abort();
      stop();
    };
  }, [sport, eventId, request, retry]);

  const event = data?.events.find((item) => item.id === eventId);
  const detail = data?.detail;
  const incompleteMarket = detail?.marketTruncated || detail?.marketError;
  const tapes =
    detail?.evidence.tapes.filter(
      (t) => !market || t.latest.market === market,
    ) || [];
  const dispersion =
    detail?.evidence.dispersion.filter(
      (d) => !market || d.low.market === market,
    ) || [];
  const update = (field: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(field, value);
    else next.delete(field);
    if (field === "sport") {
      next.delete("event");
      next.delete("market");
    }
    router.push(`/vegas-fear?${next}`);
  };

  return (
    <Shell active="intelligence">
      <div className="fear-page">
        <header className="fear-hero">
          <p className="fear-kicker">Vegas Fear</p>
          <h1>Market pressure</h1>
          <p>
            Compare collected prices and line changes for upcoming games. Every
            observation keeps its book, source and timestamp.
          </p>
        </header>
        <section
          className="fear-panel fear-controls"
          aria-label="Market pressure filters"
        >
          <label>
            <span id="fear-sport-label">Sport</span>
            <select
              aria-labelledby="fear-sport-label"
              value={sport}
              onChange={(e) => update("sport", e.target.value)}
            >
              {fearSports.map((value) => (
                <option key={value} value={value}>
                  {names[value]}
                </option>
              ))}
            </select>
          </label>
          {supportedFearSport(sport) && (
            <>
              <label>
                <span id="fear-event-label">Event</span>
                <select
                  aria-labelledby="fear-event-label"
                  value={eventId}
                  onChange={(e) => update("event", e.target.value)}
                >
                  <option value="">Select an event</option>
                  {eventId && !event && (
                    <option value={eventId}>Selected event</option>
                  )}
                  {data?.events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.away} at {item.home} ·{" "}
                      {item.tbd ? "Time TBD" : when(Date.parse(item.start))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span id="fear-market-label">Market</span>
                <select
                  aria-labelledby="fear-market-label"
                  value={market}
                  onChange={(e) => update("market", e.target.value)}
                >
                  <option value="">All supported markets</option>
                  {marketKeys(sport).map((value) => (
                    <option key={value} value={value}>
                      {markets[value]}
                    </option>
                  ))}
                  {market && !marketKeys(sport).includes(market) && (
                    <option value={market}>Unavailable market</option>
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setRetry((x) => x + 1)}
                disabled={!data && !error}
              >
                {error ? "Retry" : "Refresh sources"}
              </button>
            </>
          )}
        </section>
        {!supportedFearSport(sport) && (
          <p className="fear-panel">
            Market pressure for {names[sport]} is unavailable in this draft.
          </p>
        )}
        {supportedFearSport(sport) && !data && !error && (
          <p className="fear-panel" role="status">
            Checking schedule and access…
          </p>
        )}
        {error && (
          <p className="fear-panel" role="alert">
            Schedule or access could not be checked. Retry to load the view.
          </p>
        )}
        {data && (
          <>
            {data.truncated && (
              <p className="fear-panel">
                Schedule results reached the display limit. Additional games may
                be available later.
              </p>
            )}
            {!data.events.length && (
              <p className="fear-panel">
                No upcoming events returned for this sport.
              </p>
            )}
            {eventId && !event && (
              <p className="fear-panel">
                This event is outside the loaded schedule.
              </p>
            )}
            {data.access !== "allowed" && (
              <p className="fear-panel">
                {data.access === "signed-out"
                  ? "Sign in to see market observations."
                  : "Research access is required."}{" "}
                <Link href="/membership">View research access</Link>
              </p>
            )}
            {event?.tbd && (
              <p className="fear-panel">
                Market history is unavailable until the event time is confirmed.
              </p>
            )}
          </>
        )}
        {event && detail && (
          <>
            <section className="fear-panel" aria-labelledby="fear-tape">
              <h2 id="fear-tape">
                {event.away} at {event.home}
              </h2>
              <p>
                Full game · Up to {historyHours} hours requested · Fetch started{" "}
                {when(detail.fetchedAt)}
              </p>
              <p>
                Loaded {detail.marketCoverage.rows} snapshots across{" "}
                {detail.marketCoverage.markets} markets and{" "}
                {detail.marketCoverage.books} books.
                {detail.marketCoverage.earliest !== null &&
                detail.marketCoverage.latest !== null
                  ? ` Observed ${when(detail.marketCoverage.earliest)} to ${when(detail.marketCoverage.latest)}.`
                  : " No usable observation timestamps in the loaded window."}
              </p>
              <p>
                First observed means the earliest eligible quote in the loaded
                subset. Markets and books may have gaps.
              </p>
              {detail.marketError && (
                <p role="alert">
                  Quote source unavailable. Any shown comparisons use only
                  successfully loaded pages. Refresh sources to retry.
                </p>
              )}
              {detail.marketTruncated && (
                <p>
                  Quote history reached the query limit. Earlier observations or
                  markets may be missing. Movement uses only the loaded subset.
                </p>
              )}
              {detail.evidence.excluded > 0 && (
                <p>
                  {detail.evidence.excluded} snapshots excluded for missing,
                  conflicting or invalid evidence.
                </p>
              )}
              {detail.evidence.ambiguous && (
                <p>
                  Multiple provider event identities were found. Comparisons are
                  unavailable.
                </p>
              )}
              {!tapes.length && !detail.marketError && (
                <p>
                  {incompleteMarket
                    ? "Movement unavailable in the loaded subset for this selection."
                    : "Movement unavailable. No eligible quote history for this selection."}
                </p>
              )}
              <div className="fear-grid">
                {tapes.map(({ first, latest, observations, stale }) => (
                  <article
                    className="fear-quote"
                    key={JSON.stringify([
                      latest.provider,
                      latest.book,
                      latest.market,
                      latest.selection,
                      latest.player,
                    ])}
                  >
                    <p className="fear-kicker">
                      {latest.book} · {markets[latest.market]}
                    </p>
                    <h3>{selection(latest)}</h3>
                    <p>
                      {stale ? "Older snapshot" : "Recent at fetch"} ·{" "}
                      {observations} observation{observations === 1 ? "" : "s"}
                    </p>
                    <dl>
                      <Quote
                        label={
                          incompleteMarket
                            ? "First observed in loaded subset"
                            : "First observed"
                        }
                        quote={first}
                      />
                      {observations > 1 && (
                        <Quote label="Latest observed" quote={latest} />
                      )}
                    </dl>
                    {observations < 2 ? (
                      <p>
                        Movement unavailable. A second observation is needed.
                      </p>
                    ) : (
                      <p>
                        {Math.round((latest.observed - first.observed) / 1000)}{" "}
                        seconds between observations.{" "}
                        {first.line !== latest.line
                          ? `Line moved from ${first.line} to ${latest.line}. Price comparison unavailable across thresholds.`
                          : `Same threshold price from ${price(first.odds)} to ${price(latest.odds)}.`}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section className="fear-panel">
              <h2>Comparable book prices</h2>
              <p>
                Same event, market, selection and threshold. Quotes must be
                within {quoteAgeMinutes} minutes of the fetch and{" "}
                {bookWindowMinutes} minutes of the newest quote.
              </p>
              {detail.marketTruncated ? (
                <p>Dispersion unavailable with truncated book coverage.</p>
              ) : detail.marketError ? (
                <p>Dispersion unavailable with incomplete quote coverage.</p>
              ) : dispersion.length ? (
                <ul>
                  {dispersion.map(({ quotes, low, high }) => (
                    <li
                      key={JSON.stringify([
                        low.market,
                        low.selection,
                        low.player,
                        low.line,
                      ])}
                    >
                      {markets[low.market]} · {selection(low)}
                      {low.line === null ? "" : ` · ${low.line}`} ·{" "}
                      {quotes.length} books · {price(low.odds)} to{" "}
                      {price(high.odds)}
                      <ul>
                        {quotes.map((q) => (
                          <li key={q.book}>
                            {q.book} {price(q.odds)} · {when(q.observed)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Dispersion unavailable. At least two comparable current books
                  are needed.
                </p>
              )}
            </section>
            <section className="fear-panel">
              <h2>Reported availability</h2>
              <p>
                Exact event reports with source dates. Coverage is partial and
                may be older. Lineup and weather comparisons are unavailable.
              </p>
              {detail.contextError && (
                <p role="alert">
                  Availability source could not load. Refresh sources to retry.
                </p>
              )}
              {detail.contextTruncated && (
                <p>Report results reached the query limit.</p>
              )}
              {!detail.reports.length && !detail.contextError && (
                <p>No dated injury reports returned.</p>
              )}
              <ul>
                {detail.reports.map((report) => (
                  <li key={JSON.stringify([report.team, report.player])}>
                    {report.player} · {report.team} · Reported {report.status} ·{" "}
                    {when(report.observed)} ·{" "}
                    <a href={report.source} target="_blank" rel="noreferrer">
                      Source ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
