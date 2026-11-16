"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import RoomPublications from "./room-publications";
import { SPORTS } from "@/lib/sports";
import { sourceAge, TOPIC_NAMES, type Finding } from "@/lib/research-hub";
import type { HubData } from "@/lib/research-hub-reader";
import {
  coverage,
  eventResearchHref,
  fullMatchupHref,
  chronologicalFindings,
} from "@/lib/discovery/model";
import {
  ROOM_TOPICS,
  ROOM_LABELS,
  resolveRoom,
  roomSources,
  roomPublicationHref,
  type RoomReference,
} from "@/lib/game-room";
import "./game-room.css";
export function roomTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time not supplied";
  return (
    new Date(value).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}
function Evidence({ item }: { item: Finding }) {
  const publication = roomPublicationHref(item.publicationHref);
  return (
    <article className="gr-card" id={`evidence-${encodeURIComponent(item.id)}`}>
      <p className="gr-kicker">{item.label}</p>
      <h3>{item.title}</h3>
      <p className="gr-copy">
        {item.text.slice(0, 220)}
        {item.text.length > 220 ? "…" : ""}
      </p>
      <p className="gr-muted">
        {item.label === "Published research" ? "Published" : "Recorded"}:{" "}
        {roomTime(item.recordedAt)}
      </p>
      <details>
        <summary>Full research, sources & timing</summary>
        <p className="gr-copy">{item.text || "No readable detail supplied."}</p>
        <p>
          {sourceAge(item.sourceAt)} · Source time: {roomTime(item.sourceAt)}
        </p>
        {roomSources([item]).length ? (
          <ul>
            {roomSources([item]).map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {new URL(url).hostname}{" "}
                  <span className="sr-only">(opens a new tab)</span>↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No source link supplied.</p>
        )}
        <p className="gr-muted">Record reference: {item.id}</p>
      </details>
      {publication && (
        <Link href={publication}>
          Original publication, outcomes & corrections →
        </Link>
      )}
    </article>
  );
}
/** Pure view: callers retain existing readers and authorization; denied data is never rendered. */
export default function GameIntelligenceRoom({
  data,
  reference,
  loading = false,
  failed = false,
  refresh,
  linkedPublications = false,
  homeHref = "/staging/discovery",
  zoneHref = "/community",
}: {
  data: HubData;
  reference: RoomReference;
  loading?: boolean;
  failed?: boolean;
  refresh?: () => void;
  linkedPublications?: boolean;
  homeHref?: string;
  zoneHref?: string;
}) {
  const [query, setQuery] = useState("");
  const { event, findings, dateChanged } = resolveRoom(data, reference);
  const ordered = useMemo(() => chronologicalFindings(findings), [findings]);
  const filtered = ordered.filter((f) =>
    `${f.title} ${f.text}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const sources = roomSources(findings);
  const zoneLink = `${zoneHref}${zoneHref.includes("?") ? "&" : "?"}sport=${reference.sport}`;
  return (
    <main className="gr" id="game-intelligence-room">
      <nav aria-label="Game room navigation">
        <Link href={homeHref}>Home & games</Link>
        <Link href={zoneLink}>The Zone</Link>
      </nav>
      <header className="gr-hero">
        <p className="gr-kicker">
          {SPORTS[reference.sport].label} / GAME INTELLIGENCE
        </p>
        <h1>
          {event ? `${event.away} at ${event.home}` : "Game intelligence room"}
        </h1>
        <p>One matchup. The evidence, in context.</p>
        <p className="gr-muted">
          Game reference: {reference.sport}:{reference.id}
          {reference.date ? ` · Linked date ${reference.date} ET` : ""}
        </p>
        {event && (
          <dl className="gr-facts">
            <div>
              <dt>Reported status</dt>
              <dd>{event.status || "Not supplied"}</dd>
            </div>
            <div>
              <dt>Scheduled start</dt>
              <dd>{event.tbd ? "Time TBD" : roomTime(event.start)}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{event.venue || "Not supplied"}</dd>
            </div>
            <div>
              <dt>Schedule record</dt>
              <dd>{roomTime(event.scheduleAt)}</dd>
            </div>
          </dl>
        )}
      </header>
      <p role="status">
        {loading
          ? "Checking this matchup and permitted research…"
          : failed
            ? "The reader could not be reached. No cached research is being shown."
            : data.denied
              ? data.signedIn
                ? "Research access required. Protected findings are not shown."
                : "Sign in for permitted research."
              : event
                ? coverage(data, event)
                : "This identity is not available in the current reader window."}
      </p>
      {refresh && (
        <button onClick={refresh} disabled={loading}>
          Refresh evidence
        </button>
      )}
      {dateChanged && (
        <p className="gr-notice">
          The current schedule date differs from the linked date. The game ID is
          unchanged; no replacement matchup was selected.
        </p>
      )}
      {!!data.errors.length && (
        <details open className="gr-notice">
          <summary>Source limitations</summary>
          <ul>
            {data.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
      {data.truncated && (
        <p className="gr-notice">
          Partial coverage: the source reader reached its limit. Absence here
          does not establish that no research exists.
        </p>
      )}
      {!event && !loading && (
        <section className="gr-card">
          <h2>Stable link, limited historical coverage</h2>
          <p>
            This room keeps its sport and game reference. The current reader
            excludes completed games and uses a limited upcoming window, so a
            missing matchup is not a cancelled game or proof of no research. A
            permanent research archive is not yet available.
          </p>
          <Link
            href={`/research?sport=${reference.sport}&event=${encodeURIComponent(`${reference.sport}:${reference.id}`)}`}
          >
            Search original research
          </Link>
        </section>
      )}
      {event && (
        <>
          <nav className="gr-sections" aria-label="Room sections">
            <a href="#gr-research">Research</a>
            <a href="#gr-publications">Publications & charts</a>
            <a href="#gr-sources">Sources</a>
            <a href="#gr-discussion">Discussion</a>
          </nav>
          <section id="gr-research">
            <h2>Research intelligence</h2>
            <label className="gr-search">
              Search this game's available research
              <input
                type="search"
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Player, team or topic"
              />
            </label>
            <p aria-live="polite">{filtered.length} returned items match.</p>
            {ROOM_TOPICS.map((topic) => {
              const rows = filtered.filter((f) => f.topic === topic);
              const title =
                topic === "context"
                  ? ROOM_LABELS[event.sport].context
                  : topic === "lineups"
                    ? ROOM_LABELS[event.sport].lineup
                    : TOPIC_NAMES[topic];
              return (
                <section key={topic} className="gr-topic">
                  <h3>{title}</h3>
                  {rows.length ? (
                    <div className="gr-grid">
                      {rows.map((f) => (
                        <Evidence key={f.id} item={f} />
                      ))}
                    </div>
                  ) : (
                    <p className="gr-muted">
                      {data.denied
                        ? "Research access required."
                        : query
                          ? "No returned items match this search."
                          : "No accessible items returned for this topic. Coverage is not guaranteed."}
                    </p>
                  )}
                </section>
              );
            })}
          </section>
          <section id="gr-publications" className="gr-card">
            <h2>Publications, charts & recorded outcomes</h2>
            <p>
              Published research keeps its original record reference and
              timestamp above. Full charts, downloads, recorded outcomes and
              corrections remain at their original destinations; nothing here
              regrades a pick or recreates a historical snapshot.
            </p>
            {linkedPublications &&
              !loading &&
              !failed &&
              !data.denied &&
              data.signedIn && (
                <RoomPublications key={event.key} reference={reference} />
              )}
            <div className="gr-links">
              <Link href={eventResearchHref(event)}>
                Complete research dossier
              </Link>
              <Link href={fullMatchupHref(event)}>
                Full matchup, charts & selections
              </Link>
            </div>
            <p className="gr-muted">
              The connected reader does not provide a complete chart or
              correction ledger. Historical coverage may be incomplete.
            </p>
          </section>
          <section id="gr-sources" className="gr-card">
            <h2>Source directory</h2>
            {sources.length ? (
              <ul>
                {sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                      <span className="sr-only"> (opens a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No source URLs returned for accessible research.</p>
            )}
            <p className="gr-muted">
              Publication, collection and provider times are distinct. A refresh
              does not make an older source current.
            </p>
          </section>
        </>
      )}
      <section id="gr-discussion" className="gr-card">
        <h2>Discussion & community</h2>
        <p>
          Game-linked discussion is not established by this reader. This link
          opens the sport's Zone, not a conversation falsely attributed to this
          game. Existing comments, reactions, authors and permissions stay
          unchanged.
        </p>
        <Link href={zoneLink}>
          Open {SPORTS[reference.sport].label} conversations →
        </Link>
      </section>
    </main>
  );
}
