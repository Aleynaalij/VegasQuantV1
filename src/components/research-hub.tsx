"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  BookOpen,
  RefreshCw,
  ArrowLeft,
  CalendarDays,
} from "lucide-react";
import { Shell } from "./ui";
import { onUserChange } from "@/lib/auth-user";
import { SPORTS, SPORT_ORDER } from "@/lib/sports";
import { readResearchHub, type HubData } from "@/lib/research-hub-reader";
import {
  TOPICS,
  TOPIC_NAMES,
  hubFilters,
  hubHref,
  filterEvents,
  eventHref,
  sourceAge,
  type Finding,
  type HubFilters,
  type ResearchEvent,
} from "@/lib/research-hub";
import NbaLineups, { NbaLineupsProvider } from "./nba-lineups";
import NhlGameReport from "./sport/nhl-game-report";
import "@/app/research-hub.css";
const when = (at: string | null, tbd = false) => {
  const d = new Date(at || "");
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        ...(tbd ? {} : { hour: "numeric", minute: "2-digit" }),
      }) + (tbd ? " · Time TBD" : " ET")
    : "Time not supplied";
};
function SourceNote({ item, now }: { item: Finding; now: number }) {
  return (
    <div className="rh-source">
      <span
        data-age={sourceAge(
          item.sourceAt,
          now,
          item.label === "Observed quote" ? 30 * 60_000 : 60 * 60_000,
        )}
      >
        {sourceAge(
          item.sourceAt,
          now,
          item.label === "Observed quote" ? 30 * 60_000 : 60 * 60_000,
        )}
      </span>
      {item.sourceAt && <span>Source time: {when(item.sourceAt)}</span>}
      {item.recordedAt && (
        <span>
          {item.label === "Published research" ? "Published" : "Collected"}:{" "}
          {when(item.recordedAt)}
        </span>
      )}
      {item.publicationHref && (
        <Link href={item.publicationHref}>
          Original publication <ArrowUpRight size={12} aria-hidden="true" />
        </Link>
      )}
      {item.sources.length ? (
        item.sources.map((url) => (
          <a href={url} key={url} target="_blank" rel="noopener noreferrer">
            {new URL(url).hostname.replace(/^www\./, "")}{" "}
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        ))
      ) : (
        <span>No source link supplied</span>
      )}
    </div>
  );
}
function Dossier({
  event,
  data,
  filters,
  now,
}: {
  event: ResearchEvent;
  data: HubData;
  filters: HubFilters;
  now: number;
}) {
  const [limit, setLimit] = useState(20);
  const own = data.findings.filter((f) => f.eventKey === event.key),
    filtered = own.filter(
      (f) => filters.topic === "all" || filters.topic === f.topic,
    );
  const topics = TOPICS.filter(
    (t) => t !== "all" && (filters.topic === "all" || filters.topic === t),
  );
  return (
    <section className="rh-dossier" aria-label="Event dossier">
      <Link className="rh-back" href={hubHref(filters, { event: "" })}>
        <ArrowLeft size={15} aria-hidden="true" /> All tracked events
      </Link>
      <header className="rh-dossier-heading">
        <span className="rh-kicker">
          {SPORTS[event.sport].label} / Event dossier
        </span>
        <h2>
          {event.away}
          <span>at {event.home}</span>
        </h2>
        <p>
          {when(event.start, event.tbd)} · {event.venue || "Venue not supplied"}
        </p>
        <p className="rh-muted">
          {event.status.replace(/^STATUS_/, "").replaceAll("_", " ")}
        </p>
        {event.source ? (
          <a href={event.source} target="_blank" rel="noopener noreferrer">
            Schedule source ↗
          </a>
        ) : (
          <span className="rh-muted">Schedule source link unavailable</span>
        )}
        <small className="rh-muted">
          {event.scheduleAt
            ? `Schedule observed ${when(event.scheduleAt)}`
            : "Schedule source time not supplied"}
        </small>
        <div className="rh-actions">
          <Link href={eventHref(event)}>
            Full matchup & published selections{" "}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/parlays">
            Build a lay <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {data.denied ? (
        <AccessNotice signedIn={data.signedIn} />
      ) : (
        <>
          <div className="rh-dossier-note">
            <BookOpen size={17} aria-hidden="true" />
            <p>
              Research follows the evidence. Reports can change before the
              event. A collection time is not the time a source last changed.
            </p>
          </div>
          {topics.map((topic) => {
            const items = filtered.filter((f) => f.topic === topic);
            return (
              <section
                className="rh-topic-section"
                key={topic}
                aria-label={TOPIC_NAMES[topic]}
              >
                <div className="rh-section-title">
                  <h3>{TOPIC_NAMES[topic]}</h3>
                  <span>
                    {items.length
                      ? `${items.length} saved ${items.length === 1 ? "item" : "items"}`
                      : "Coverage note"}
                  </span>
                </div>
                {items.slice(0, limit).map((item) => (
                  <article className="rh-finding" key={item.id}>
                    <span className="rh-item-label">{item.label}</span>
                    <h4>{item.title}</h4>
                    <p>
                      {item.text ||
                        "No readable detail supplied in this report."}
                    </p>
                    <SourceNote item={item} now={now} />
                  </article>
                ))}
                {items.length > limit && (
                  <button
                    className="rh-more"
                    onClick={() => setLimit((n) => n + 20)}
                  >
                    Show more {TOPIC_NAMES[topic].toLowerCase()}
                  </button>
                )}
                {topic === "lineups" &&
                event.sport === "nba" &&
                event.awayAbbreviation &&
                event.homeAbbreviation ? (
                  <NbaLineupsProvider key={event.key}>
                    <NbaLineups
                      game={{
                        away: event.awayAbbreviation,
                        home: event.homeAbbreviation,
                        start: event.start,
                        tbd: event.tbd,
                      }}
                    />
                  </NbaLineupsProvider>
                ) : topic === "lineups" && event.sport === "nhl" ? (
                  <NhlGameReport key={event.key} gameId={event.id} />
                ) : (
                  !items.length && (
                    <p className="rh-gap">
                      {topic === "weather"
                        ? event.sport !== "nfl"
                          ? "No event-specific outdoor-weather report is linked. Weather is generally not a playing-condition factor for indoor events."
                          : /dome|closed|indoor/i.test(event.roof || "")
                            ? "The schedule lists an indoor or closed-roof venue. No outdoor playing-condition forecast is shown."
                            : "No sourced weather briefing is linked to this event yet. Check the venue forecast before kickoff."
                        : topic === "injuries"
                          ? "No linked injury report is available in this view. This does not mean everyone is healthy or available."
                          : topic === "lineups"
                            ? "No confirmed starting lineup is linked to this event. A roster or depth chart is not a confirmed lineup."
                            : topic === "markets"
                              ? "No market observations are available here. This does not imply there has been no line movement."
                              : "No linked research is available for this section yet. Explore the full matchup for other available coverage."}
                    </p>
                  )
                )}
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}
function AccessNotice({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rh-access">
      <span className="rh-kicker">Member research</span>
      <h3>
        {signedIn ? "Research access is required" : "Open your research access"}
      </h3>
      <p>
        Browse the schedule, then sign in with research access to explore saved
        reports, availability and market observations.
      </p>
      <Link href="/membership">
        {signedIn ? "View research access" : "Sign in & view access"}{" "}
        <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
export default function ResearchHub() {
  const params = useSearchParams(),
    router = useRouter(),
    filters = hubFilters(params);
  const [data, setData] = useState<HubData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [now, setNow] = useState(() => Date.now()),
    [eventLimit, setEventLimit] = useState(24);
  const sequence = useRef(0);
  useEffect(() => {
    let live = true;
    async function load() {
      const request = ++sequence.current;
      setLoading(true);
      setError(false);
      setData(null);
      try {
        const result = await readResearchHub();
        if (live && request === sequence.current) {
          setData(result);
          setNow(Date.now());
        }
      } catch {
        if (live && request === sequence.current) {
          setError(true);
          setData(null);
        }
      } finally {
        if (live && request === sequence.current) setLoading(false);
      }
    }
    void load();
    const stop = onUserChange(() => {
      ++sequence.current;
      setData(null);
      setLoading(true);
      void load();
    });
    return () => {
      live = false;
      ++sequence.current;
      stop();
    };
  }, [retry]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setEventLimit(24);
  }, [filters.sport, filters.topic, filters.date, filters.query]);
  const update = (patch: Partial<HubFilters>) =>
    router.replace(
      hubHref(filters, {
        ...patch,
        event: "topic" in patch ? filters.event : "",
      }),
      { scroll: false },
    );
  const events = useMemo(
      () => filterEvents(data?.events || [], data?.findings || [], filters),
      [data, filters.sport, filters.topic, filters.date, filters.query],
    ),
    selected = data?.events.find((e) => e.key === filters.event);
  return (
    <Shell active="feed">
      <div className="rh-hub">
        <header className="rh-hero">
          <div className="rh-kicker">
            <span /> VEGAS QUANT / RESEARCH
          </div>
          <div className="rh-hero-row">
            <div>
              <h1>
                The research lounge
                <span>Know the game. See the whole picture.</span>
              </h1>
              <p>
                Your desk for the events ahead. Availability, context and the
                market—connected to their sources.
              </p>
            </div>
            <div className="rh-edition">
              <CalendarDays size={22} aria-hidden="true" />
              <b>THE NEXT SEVEN DAYS</b>
              <span>One desk. Every sport.</span>
              <small>All dates & times Eastern</small>
            </div>
          </div>
        </header>
        <section className="rh-controls" aria-label="Research filters">
          <div className="rh-sports" aria-label="Filter by sport">
            {(["all", ...SPORT_ORDER] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filters.sport === s}
                onClick={() => update({ sport: s })}
              >
                {s === "all" ? "All sports" : SPORTS[s].label}
              </button>
            ))}
          </div>
          <div className="rh-search-row">
            <label className="rh-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search teams, players or events</span>
              <input
                type="search"
                placeholder="Search teams, players or events"
                maxLength={100}
                value={filters.query}
                onChange={(e) => update({ query: e.target.value })}
              />
            </label>
            <label className="rh-date">
              Event date{" "}
              <input
                aria-label="Event date"
                type="date"
                value={filters.date}
                onChange={(e) => update({ date: e.target.value })}
              />
            </label>
          </div>
          <div className="rh-filter-row">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <label>
              Research topic{" "}
              <select
                value={filters.topic}
                onChange={(e) =>
                  update({ topic: e.target.value as HubFilters["topic"] })
                }
              >
                {TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {TOPIC_NAMES[t]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => router.replace("/research", { scroll: false })}
            >
              Reset filters
            </button>
            <button
              className="rh-refresh"
              type="button"
              disabled={loading}
              onClick={() => setRetry((n) => n + 1)}
            >
              <RefreshCw size={14} aria-hidden="true" />{" "}
              {loading ? "Checking…" : "Refresh sources"}
            </button>
          </div>
        </section>
        {loading && (
          <div className="rh-state" role="status">
            <span className="rh-kicker">Opening the desk</span>
            <h2>Gathering tracked events…</h2>
            <p>Checking schedule and research access.</p>
          </div>
        )}
        {error && (
          <div className="rh-state" role="alert">
            <h2>The research desk could not load</h2>
            <p>A source failure is not an empty schedule.</p>
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              Retry research
            </button>
          </div>
        )}
        {data && !loading && (
          <>
            {!!data.errors.length && (
              <div className="rh-warning" role="alert">
                <b>Partial coverage</b>
                {data.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
                <button type="button" onClick={() => setRetry((n) => n + 1)}>
                  Retry unavailable sources
                </button>
              </div>
            )}
            {data.truncated && (
              <p className="rh-warning">
                This view reached a source display limit. Search covers loaded
                reports only; the full matchup may contain more history.
              </p>
            )}
            {filters.event ? (
              selected ? (
                <Dossier
                  key={selected.key + filters.topic}
                  event={selected}
                  data={data}
                  filters={filters}
                  now={now}
                />
              ) : (
                <div className="rh-state">
                  <h2>Event unavailable in this window</h2>
                  <p>
                    This link is outside the next seven days, or its schedule
                    source could not load. Your filters are preserved.
                  </p>
                  <Link href={hubHref(filters, { event: "" })}>
                    Return to tracked events
                  </Link>
                </div>
              )
            ) : (
              <>
                <div className="rh-list-heading">
                  <div>
                    <span className="rh-kicker">The event ledger</span>
                    <h2>
                      On the horizon <span>{events.length}</span>
                    </h2>
                  </div>
                  <p>Open a matchup to explore its evidence.</p>
                </div>
                {data.denied && <AccessNotice signedIn={data.signedIn} />}
                {!!filters.query && (
                  <p className="rh-muted">
                    Search includes schedule details and collected research
                    available to your account. Missing reports and live
                    lineup-only names may not be indexed.
                  </p>
                )}
                {events.length ? (
                  <div className="rh-events">
                    {events.slice(0, eventLimit).map((e) => {
                      const own = data.findings.filter(
                          (f) =>
                            f.eventKey === e.key &&
                            (filters.topic === "all" ||
                              f.topic === filters.topic),
                        ),
                        count = new Set(own.map((i) => i.topic)).size;
                      return (
                        <Link
                          className="rh-event"
                          href={hubHref(filters, { event: e.key })}
                          key={e.key}
                        >
                          <div className="rh-event-top">
                            <span className={`rh-sport rh-${e.sport}`}>
                              {SPORTS[e.sport].label}
                            </span>
                            <span>{when(e.start, e.tbd)}</span>
                          </div>
                          <h3>
                            {e.away}
                            <span>at {e.home}</span>
                          </h3>
                          <p className="rh-venue">
                            {e.venue || "Venue to be confirmed"}
                          </p>
                          <div className="rh-event-bottom">
                            <span>
                              {data.denied
                                ? "Schedule preview"
                                : count
                                  ? `${count} research ${count === 1 ? "topic" : "topics"} available`
                                  : "Research coverage pending"}
                            </span>
                            <span>
                              Open dossier{" "}
                              <ArrowUpRight size={17} aria-hidden="true" />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rh-state">
                    <h3>
                      {data.errors.length
                        ? "No matching events in the available sources"
                        : data.events.length
                          ? "No events match these filters"
                          : "No upcoming events returned"}
                    </h3>
                    <p>
                      {data.errors.length
                        ? "Some sources could not load. Retry before treating this as a complete schedule."
                        : "Try another sport, topic or date. No research has been invented to fill this view."}
                    </p>
                    <button
                      onClick={() =>
                        router.replace("/research", { scroll: false })
                      }
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {events.length > eventLimit && (
                  <button
                    className="rh-more"
                    onClick={() => setEventLimit((n) => n + 24)}
                  >
                    Show more tracked events
                  </button>
                )}
                <section className="rh-footnote">
                  <span className="rh-kicker">A clearer read</span>
                  <h3>Facts first. Interpretation second.</h3>
                  <p>
                    Source reports, stored quotes and published analysis carry
                    their own labels and dates. Unavailable does not mean
                    healthy. Quiet markets do not mean low risk.
                  </p>
                  <Link href="/feed?view=archive">
                    Browse historical publications{" "}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
