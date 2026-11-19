"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { Shell } from "@/components/ui";
import { readResearchHub, type HubData } from "@/lib/research-hub-reader";
import { watchDiscoveryAccess } from "@/lib/discovery/revalidate";
import { supabase } from "@/lib/supabase";
import { SPORTS, SPORT_ORDER } from "@/lib/sports";
import {
  hubFilters,
  filterEvents,
  sourceAge,
  type Finding,
  type ResearchEvent,
} from "@/lib/research-hub";
import {
  gameZonePosts,
  zonePostHref,
  zonePostLead,
  type GameZonePost,
} from "@/lib/game-zone-posts";
import {
  chronologicalFindings,
  compactText,
  coverage,
  discoveryHref,
  eventResearchHref,
  findingHref,
  fullMatchupHref,
  type PostState,
} from "@/lib/discovery/model";
import { fixtureScenario, stagingPostFixtures } from "@/lib/discovery/fixtures";
import "./discovery.css";
const EMPTY: HubData = {
  events: [],
  findings: [],
  errors: [],
  denied: true,
  signedIn: false,
  truncated: false,
};
function when(at: string | null) {
  if (!at || !Number.isFinite(Date.parse(at))) return "Time not supplied";
  return (
    new Date(at).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}
function FindingCard({ item, event }: { item: Finding; event: ResearchEvent }) {
  return (
    <article className="d1-research-card">
      <span className="d1-eyebrow">{item.label}</span>
      <h3>{item.title}</h3>
      <p>{compactText(item.text) || "No readable detail supplied."}</p>
      <p className="d1-meta">
        {item.label === "Published research" ? "Published" : "Collected"}:{" "}
        {when(item.recordedAt)}
      </p>
      <details>
        <summary>Full excerpt, sources & timing</summary>
        <div className="d1-excerpt">
          <p>{item.text || "No readable detail supplied."}</p>
          <p>
            {sourceAge(item.sourceAt)} · Source time: {when(item.sourceAt)}
          </p>
          {item.sources.length ? (
            <ul>
              {item.sources.map((url) => (
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
          {item.publicationHref && (
            <Link href={item.publicationHref}>
              Original publication <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </details>
      <Link className="d1-link" href={findingHref(event, item)}>
        Open full research <ChevronRight size={16} />
      </Link>
    </article>
  );
}
function RoomPosts({
  event,
  fixtures,
  signedIn,
}: {
  event: ResearchEvent;
  fixtures: boolean;
  signedIn: boolean;
}) {
  const [state, setState] = useState<PostState>("loading"),
    [posts, setPosts] = useState<GameZonePost[]>([]),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true,
      generation = 0;
    async function load() {
      const own = ++generation;
      setPosts([]);
      setState("loading");
      if (fixtures) {
        const rows = signedIn ? stagingPostFixtures[event.key] || [] : [];
        setPosts(rows);
        setState(!signedIn ? "signed-out" : rows.length ? "ready" : "empty");
        return;
      }
      try {
        const session = await supabase.auth.getSession();
        if (!mounted || own !== generation) return;
        if (!session.data.session) {
          setState("signed-out");
          return;
        }
        const result = await supabase.rpc("game_zone_posts", {
          p_sport: event.sport,
          p_game: event.id,
        });
        if (!mounted || own !== generation) return;
        if (result.error) {
          setState("unavailable");
          return;
        }
        const rows = gameZonePosts(result.data);
        // Malformed response is not evidence that no publication exists.
        if (!Array.isArray(result.data) || rows.length !== result.data.length) {
          setState("unavailable");
          return;
        }
        setPosts(rows);
        setState(rows.length ? "ready" : "empty");
      } catch {
        if (mounted && own === generation) setState("unavailable");
      }
    }
    void load();
    const stop = fixtures
      ? () => {}
      : watchDiscoveryAccess(
          () => {
            ++generation;
            setPosts([]);
            setState("loading");
          },
          () => void load(),
          (changed) => {
            const { data } = supabase.auth.onAuthStateChange(changed);
            return () => data.subscription.unsubscribe();
          },
        );
    return () => {
      mounted = false;
      ++generation;
      stop();
    };
  }, [event.id, event.sport, attempt, fixtures, signedIn]);
  return (
    <section aria-labelledby="d1-posts">
      <header className="d1-section-title">
        <div>
          <span className="d1-eyebrow">Original publications</span>
          <h2 id="d1-posts">From The Zone</h2>
        </div>
        <BookOpen aria-hidden="true" />
      </header>
      <p className="d1-muted">
        Existing posts, charts and conversations stay with their original
        authors and records. Open a publication to see full cards, corrections,
        comments and reactions.
      </p>
      <p role="status">
        {state === "loading"
          ? "Checking game publications…"
          : state === "signed-out"
            ? "Sign in to view this game’s Zone publications."
            : state === "unavailable"
              ? "Publications could not be checked. This is not a no-pick decision."
              : state === "empty"
                ? "No accessible linked publications were returned. This may mean no posts or restricted access; it is not a no-pick decision. Original sport research may still be available."
                : `${posts.length} linked publications returned.`}
      </p>
      {state === "unavailable" && (
        <button onClick={() => setAttempt((a) => a + 1)}>
          Retry publications
        </button>
      )}
      {state === "signed-out" && <Link href="/membership">Sign in</Link>}
      <div className="d1-research-grid">
        {posts.map((post) => (
          <article className="d1-research-card" key={post.id}>
            <span className="d1-eyebrow">
              {post.author_name || "Original author"}
            </span>
            <h3>{post.title}</h3>
            <p>{zonePostLead(post.body, 180)}</p>
            <p className="d1-meta">Published {when(post.created_at)}</p>
            <p className="d1-meta">
              {post.comments} comments · {post.reactions} reactions
              {post.card ? " · Research card attached" : ""}
            </p>
            <Link className="d1-link" href={zonePostHref(post)}>
              Full publication & discussion <ChevronRight size={16} />
            </Link>
          </article>
        ))}
      </div>
      <Link className="d1-link" href={`/community?sport=${event.sport}`}>
        Explore all {SPORTS[event.sport].label} conversations →
      </Link>
    </section>
  );
}
export default function Discovery({
  fixtures = false,
  linkedPublications = false,
}: {
  fixtures?: boolean;
  linkedPublications?: boolean;
}) {
  const router = useRouter();
  const hadAuthorizedAccess = useRef(false);
  const params = useSearchParams(),
    filters = hubFilters(params),
    roomKey = params.get("event") || "",
    scenario = params.get("scenario");
  const [data, setData] = useState<HubData>(EMPTY),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [checkedAt, setCheckedAt] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    lastRoom = useRef(roomKey);
  useEffect(() => {
    let mounted = true,
      generation = 0;
    let stop = () => {};
    const closeAccess = (reason: "denied" | "unverified") => {
      mounted = false;
      ++generation;
      setData(EMPTY);
      setCheckedAt(null);
      stop();
      router.replace(`/staging/discovery/access-denied?reason=${reason}`);
    };
    async function load() {
      const own = ++generation;
      setData(EMPTY);
      setLoading(true);
      setFailed(false);
      setCheckedAt(null);
      try {
        const result = fixtures
          ? fixtureScenario(scenario)
          : await readResearchHub();
        if (mounted && own === generation) {
          if (
            !fixtures &&
            hadAuthorizedAccess.current &&
            (!result.signedIn || result.denied)
          ) {
            closeAccess(
              result.errors.some((error) =>
                error.includes("access could not be checked"),
              )
                ? "unverified"
                : "denied",
            );
            return;
          }
          if (!fixtures && result.signedIn && !result.denied)
            hadAuthorizedAccess.current = true;
          setData(result);
          setCheckedAt(new Date().toISOString());
        }
      } catch {
        if (mounted && own === generation) {
          if (!fixtures && hadAuthorizedAccess.current)
            closeAccess("unverified");
          else setFailed(true);
        }
      } finally {
        if (mounted && own === generation) setLoading(false);
      }
    }
    void load();
    stop = fixtures
      ? () => {}
      : watchDiscoveryAccess(
          () => {
            ++generation;
            setData(EMPTY);
            setLoading(true);
            setCheckedAt(null);
          },
          () => void load(),
          (changed) => {
            const { data } = supabase.auth.onAuthStateChange(changed);
            return () => data.subscription.unsubscribe();
          },
        );
    return () => {
      mounted = false;
      ++generation;
      stop();
    };
  }, [attempt, fixtures, scenario, router]);
  useEffect(() => {
    if (lastRoom.current !== roomKey) {
      lastRoom.current = roomKey;
      heading.current?.focus();
    }
  }, [roomKey]);
  const events = useMemo(
    () => filterEvents(data.events, data.findings, filters),
    [data, filters.sport, filters.topic, filters.date, filters.query],
  );
  const event = data.events.find((e) => e.key === roomKey),
    own = event
      ? chronologicalFindings(
          data.findings.filter((f) => f.eventKey === event.key),
        )
      : [];
  return (
    <Shell active="lobby">
      <div className="d1">
        <a className="d1-skip" href="#d1-title">
          Skip to discovery
        </a>
        <div className="d1-staging">
          <b>PHASE 1 · ISOLATED STAGING</b>
          <span>
            {fixtures
              ? "SYNTHETIC FIXTURES · Not live research, records or permissions."
              : "Connected to the configured staging project. Not production. Existing access rules apply."}
          </span>
        </div>
        <nav className="d1-breadcrumb" aria-label="Discovery">
          <Link href={discoveryHref(undefined, filters.sport)}>Discovery</Link>
          <Link href="/research">Research lounge</Link>
          <Link href="/community">The Zone</Link>
          <Link href="/">Current Home</Link>
        </nav>
        <header className="d1-hero">
          <span className="d1-eyebrow">
            VEGAS QUANT / INTELLIGENCE, CONNECTED
          </span>
          <h1 id="d1-title" tabIndex={-1} ref={heading}>
            {roomKey
              ? event
                ? `${event.away} at ${event.home}`
                : "Game intelligence"
              : "Find the game. Understand the story."}
          </h1>
          <p>
            {roomKey
              ? "Research, original publications and conversations, anchored to one matchup."
              : "Explore the tracked slate. Read the evidence. Join the conversation."}
          </p>
          <p className="d1-meta">
            {checkedAt
              ? `Reader checked ${when(checkedAt)}. This is not the provider’s update time.`
              : "Checking existing sources…"}
          </p>
        </header>
        <div className="d1-status" role="status">
          {loading
            ? "Loading the tracked slate and permitted research…"
            : failed
              ? "Discovery is unavailable. Existing sports and research pages remain accessible."
              : data.denied
                ? data.signedIn
                  ? "Your existing research access does not include these findings. No permission has been changed."
                  : "Sign in to view permitted research. Schedule information may still be visible."
                : data.truncated
                  ? "Partial coverage: the existing reader reached a result limit. Full research remains available through the original pages."
                  : "Showing research returned by the existing authorized reader. Availability is not a recommendation."}
        </div>
        {data.errors.length > 0 && (
          <details className="d1-errors" open>
            <summary>
              Source or access limitations ({data.errors.length})
            </summary>
            <ul>
              {data.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </details>
        )}
        <button
          className="d1-refresh"
          onClick={() => setAttempt((a) => a + 1)}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh sources
        </button>
        {roomKey ? (
          event ? (
            <>
              <div className="d1-room-meta">
                <span>{SPORTS[event.sport].label}</span>
                <span>{event.tbd ? "Start time TBD" : when(event.start)}</span>
                <span>{event.venue || "Venue not supplied"}</span>
                <span>{event.status}</span>
              </div>
              <div className="d1-actions">
                <Link href={fullMatchupHref(event)}>
                  Full matchup, lineups & selections ↗
                </Link>
                <Link href={eventResearchHref(event)}>
                  Complete research dossier ↗
                </Link>
              </div>
              <section aria-labelledby="d1-room-research">
                <header className="d1-section-title">
                  <div>
                    <span className="d1-eyebrow">
                      Evidence, not assumptions
                    </span>
                    <h2 id="d1-room-research">Research overview</h2>
                  </div>
                </header>
                <p>{coverage(data, event)}</p>
                <div className="d1-research-grid">
                  {!data.denied &&
                    own
                      .slice(0, 6)
                      .map((item) => (
                        <FindingCard key={item.id} item={item} event={event} />
                      ))}
                </div>
                {own.length > 6 && !data.denied && (
                  <Link className="d1-link" href={eventResearchHref(event)}>
                    Open all {own.length} returned research items →
                  </Link>
                )}
              </section>
              {fixtures || linkedPublications ? (
                <RoomPosts
                  key={event.key}
                  event={event}
                  fixtures={fixtures}
                  signedIn={data.signedIn}
                />
              ) : (
                <section aria-labelledby="d1-posts">
                  <h2 id="d1-posts">Original research & conversations</h2>
                  <p>
                    Linked game publications are not available in this release.
                    This is not a no-pick decision.
                  </p>
                  <Link className="d1-link" href={eventResearchHref(event)}>
                    Open this game's research →
                  </Link>
                  <Link className="d1-link" href={fullMatchupHref(event)}>
                    Open original matchup →
                  </Link>
                  <Link
                    className="d1-link"
                    href={`/community?sport=${event.sport}`}
                  >
                    Open {SPORTS[event.sport].label} in The Zone →
                  </Link>
                  <p className="d1-muted">
                    The Zone link is sport-filtered, not game-filtered. Original
                    cards, comments and discussions remain at their existing
                    destinations.
                  </p>
                </section>
              )}
            </>
          ) : (
            !loading && (
              <section className="d1-empty">
                <h2>
                  This event is outside the available reader window or could not
                  be resolved.
                </h2>
                <p>
                  No replacement game was selected. Phase 1 uses the existing
                  upcoming-event reader, not a permanent historical archive.
                </p>
                <Link href="/research">Search the Research lounge</Link>
                <Link href="/community">Find original Zone publications</Link>
              </section>
            )
          )
        ) : (
          <>
            <section aria-labelledby="d1-tonight">
              <header className="d1-section-title">
                <div>
                  <span className="d1-eyebrow">Start with the matchup</span>
                  <h2 id="d1-tonight">Tonight & the week ahead</h2>
                </div>
              </header>
              <form className="d1-filters" method="get">
                <div className="d1-field">
                  <label htmlFor="d1-sport">Sport</label>
                  <select
                    id="d1-sport"
                    name="sport"
                    defaultValue={filters.sport}
                    key={filters.sport}
                  >
                    <option value="all">All sports</option>
                    {SPORT_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {SPORTS[s].label}
                      </option>
                    ))}
                  </select>
                </div>
                <label>
                  Find a team or research
                  <input
                    type="search"
                    name="q"
                    defaultValue={filters.query}
                    key={filters.query}
                    maxLength={100}
                    placeholder="Team, player or research"
                  />
                </label>
                <button type="submit">
                  <Search size={16} aria-hidden="true" />
                  Find games
                </button>
              </form>
              <p aria-live="polite" aria-atomic="true">
                {loading
                  ? "Checking games…"
                  : `${events.length} tracked matchups match these filters.`}
              </p>
              <div className="d1-games">
                {events.map((e) => (
                  <article className="d1-game" key={e.key}>
                    <div className="d1-game-top">
                      <span>{SPORTS[e.sport].label}</span>
                      <time dateTime={e.start}>
                        {e.tbd ? "Time TBD" : when(e.start)}
                      </time>
                    </div>
                    <h3>
                      <Link
                        href={discoveryHref(
                          e.key,
                          filters.sport,
                          filters.query,
                        )}
                      >
                        {e.away}
                        <span>at {e.home}</span>
                      </Link>
                    </h3>
                    <p className="d1-coverage">{coverage(data, e)}</p>
                    <Link
                      className="d1-link"
                      href={discoveryHref(e.key, filters.sport, filters.query)}
                    >
                      Explore this game <ChevronRight size={17} />
                    </Link>
                  </article>
                ))}
              </div>
              {!loading && !events.length && (
                <div className="d1-empty">
                  <h3>
                    {failed
                      ? "Schedule unavailable"
                      : "No matching games returned"}
                  </h3>
                  <p>
                    {failed || data.errors.length
                      ? "Source availability is incomplete. This does not mean there are no scheduled games."
                      : "Try a different sport or search. No fixtures or recommendations have been invented."}
                  </p>
                  <Link href={discoveryHref()}>Clear filters</Link>
                </div>
              )}
            </section>
            <section aria-labelledby="d1-tools">
              <header className="d1-section-title">
                <div>
                  <span className="d1-eyebrow">
                    Everything still has a home
                  </span>
                  <h2 id="d1-tools">Your VQ toolkit</h2>
                </div>
              </header>
              <nav className="d1-tools" aria-label="Existing VQ features">
                <Link href="/research">Full research lounge</Link>
                <Link href="/community?view=dealer">TheDealer & community</Link>
                <Link href="/parlays?build=1">Build a Lay</Link>
                <Link href="/parlays">My Lays & saved legs</Link>
                <Link href="/membership">Account & membership</Link>
                <Link href="/vegas-fear">
                  Fear Index · existing access rules
                </Link>
                <Link href="/">Stories & current Home</Link>
                <Link href="/history">Records · existing access rules</Link>
              </nav>
              <p className="d1-muted">
                Simulator: current Home availability remains unchanged. MLB
                development is scheduled for February 2027 and is not part of
                this candidate. Responsible-play and legal links remain in the
                existing application shell.
              </p>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
