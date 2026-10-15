"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import { ArrowUpRight, Eye, Clock3, ChevronDown } from "lucide-react";
import { Shell, Badge } from "./ui";
import BrandMark from "./brand-mark";
import DownloadCard from "./download-card";
import LondonWinningSlip from "./london-winning-slip";
import RavensWinningSlip from "./ravens-winning-slip";
import AutomaticResultCard, {
  type AutomaticResult,
} from "./automatic-result-card";
import BillsWinningSlip from "./bills-winning-slip";
import PublishedLegBoard from "./published-leg-board";
import CandidateTracker, { type CandidateRelease } from "./candidate-tracker";
import { feedTimeline } from "@/lib/feed-timeline";
import ZoneNav from "./zone-nav";
import HowItWorks from "./how-it-works";
import SectionBoundary from "./section-boundary";
import EdgeReleaseCard, { type EdgeRelease } from "./edge-release";
import { supabase } from "@/lib/supabase";
import { noAccess, type Access } from "@/lib/membership";
import { time } from "@/lib/domain";

type Post = {
  result_leg_key?: string | null;
  result_details?: AutomaticResult | null;
  id: string;
  game: { slug: string } | null;
  game_id: string | null;
  category: string;
  title: string;
  summary: string;
  matchup: string;
  away_code: string;
  home_code: string;
  market_label: string;
  why_watch: string;
  caution: string;
  next_check: string;
  source_url: string;
  source_at: string;
  created_at: string;
};
const categories = [
  "All",
  "Watchlist",
  "Injury watch",
  "Market update",
  "Decision",
];
const pageSize = 6;
// Owner-ticket recaps shown as winning cards in place of their pick drop.
const BILLS_WIN_IDS = [
  "62bfa07e-6280-4520-abd2-30595429bc6e",
  "0d8e8f5a-2470-473b-9271-c396829bb429",
];
const isParlay = (r: CandidateRelease) =>
  r.candidates.some((c) => c.parlay || c.fun_play);
const isWinPost = (p: Post) =>
  p.market_label.startsWith("zone-win:") ||
  (!!p.result_leg_key && p.result_details?.result === "WIN");
export default function ResearchFeed() {
  const [posts, setPosts] = useState<Post[]>([]),
    [access, setAccess] = useState<Access>(noAccess),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [openRelease, setOpenRelease] = useState(""),
    [filter, setFilter] = useState("All"),
    [limit, setLimit] = useState(pageSize),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const [releases, setReleases] = useState<CandidateRelease[]>([]);
  const [zoneView, setZoneView] = useState("Latest");
  const [edgeReleases, setEdgeReleases] = useState<EdgeRelease[]>([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const epoch = useRef(0);
  async function refresh() {
    const n = ++epoch.current;
    try {
      const [legs, membership, edges] = await Promise.all([
        supabase
          .from("candidate_releases")
          .select("id,title,candidates,created_at,expires_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit + 1),
        supabase.rpc("membership_status"),
        supabase.rpc("feed_edge_releases", { p_limit: limit + 1 }),
      ]);
      if (n !== epoch.current) return;
      const failures: string[] = [];
      if (legs.error) failures.push("Selections could not refresh.");
      else {
        let list = (legs.data || []) as CandidateRelease[];
        if (zoneView === "Parlays" || zoneView === "Wins") {
          const extra = await Promise.all(
            zoneView === "Parlays"
              ? [{ parlay: true }, { fun_play: true }].map((match) =>
                  supabase
                    .from("candidate_releases")
                    .select("id,title,candidates,created_at,expires_at")
                    .contains("candidates", JSON.stringify([match]))
                    .order("created_at", { ascending: false })
                    .limit(limit + 1),
                )
              : [
                  supabase
                    .from("candidate_releases")
                    .select("id,title,candidates,created_at,expires_at")
                    .in("id", BILLS_WIN_IDS),
                ],
          );
          if (n !== epoch.current) return;
          const seen = new Set(list.map((r) => r.id));
          for (const r of extra)
            for (const x of (r.data || []) as CandidateRelease[])
              if (!seen.has(x.id)) {
                seen.add(x.id);
                list.push(x);
              }
        }
        // A link from Home may point past the first page: fetch that release too.
        const wanted = window.location.hash.match(/^#release-([\w-]+)$/)?.[1];
        if (wanted && !list.some((r) => r.id === wanted)) {
          const one = await supabase
            .from("candidate_releases")
            .select("id,title,candidates,created_at,expires_at")
            .eq("id", wanted)
            .limit(1);
          if (n !== epoch.current) return;
          if (!one.error && one.data?.length)
            list = [...list, ...(one.data as CandidateRelease[])];
        }
        setReleases(list);
      }
      if (edges.error) failures.push("Official releases could not refresh.");
      else setEdgeReleases((edges.data || []) as EdgeRelease[]);
      const current = membership.error ? noAccess : (membership.data as Access);
      setAccess(current);
      if (membership.error)
        failures.push("Research access could not be checked.");
      if (!current.allowed) {
        setPosts([]);
      } else {
        let query = supabase
          .from("research_feed_posts")
          .select("*,game:games(slug)")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(limit + 1);
        if (filter !== "All") query = query.eq("category", filter);
        if (zoneView === "Wins")
          // Only wins: filtering in the query keeps paging (and "Load more") accurate.
          query = query.or(
            "market_label.like.zone-win:*,result_details->>result.eq.WIN",
          );
        const result = await query;
        if (n !== epoch.current) return;
        if (result.error) failures.push("Research updates could not refresh.");
        else setPosts((result.data || []) as Post[]);
      }
      setError(failures.join(" "));
    } catch {
      if (n === epoch.current)
        setError("The feed could not refresh. Please retry.");
    } finally {
      if (n === epoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    let live = true;
    void refresh();
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch.current;
      setPosts([]);
      setEdgeReleases([]);
      setAccess(noAccess);
      setLoading(true);
      setTimeout(() => {
        if (live) void refresh();
      }, 0);
    });
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      live = false;
      ++epoch.current;
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, limit, zoneView]);
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const payload = Object.fromEntries(data.entries());
      const source = new URL(String(payload.source_url));
      if (source.protocol !== "https:")
        throw Error("Use an HTTPS source link.");
      const observed = new Date(String(payload.source_at));
      if (
        !Number.isFinite(observed.getTime()) ||
        observed.getTime() > Date.now()
      )
        throw Error("Choose a valid past observation time.");
      const { error } = await supabase
        .from("research_feed_posts")
        .insert({ ...payload, source_at: observed.toISOString() });
      if (error)
        throw Error(
          "Publishing failed. Check your admin verification and fields.",
        );
      form.reset();
      setNotice("Published. This update is permanently preserved.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Publishing failed.");
    } finally {
      setSaving(false);
    }
  }
  const timeline = feedTimeline(posts, releases, edgeReleases, filter);
  useEffect(() => {
    const hash = window.location.hash.match(/^#release-([\w-]+)$/);
    if (hash) setOpenRelease(hash[1]);
  }, []);
  const scrolledTo = useRef("");
  useEffect(() => {
    if (!openRelease || loading || scrolledTo.current === openRelease) return;
    // Show enough items to reach the linked release, then scroll to it once.
    const i = visibleTimeline.findIndex(
      (x) => x.kind === "selection" && x.value.id === openRelease,
    );
    if (i >= limit) {
      setLimit(i + 1);
      return;
    }
    const el = document.getElementById(`release-${openRelease}`);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    scrolledTo.current = openRelease;
  });
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get("view");
    setZoneView(
      view === "legs"
        ? "Legs"
        : view === "parlays"
          ? "Parlays"
          : view === "wins"
            ? "Wins"
            : view === "injury"
              ? "Injury watch"
              : "Latest",
    );
    setFilter(view === "injury" ? "Injury watch" : "All");
  }, []);
  const visibleTimeline =
    zoneView === "Legs"
      ? timeline.filter(
          (item) =>
            item.kind !== "post" &&
            !(item.kind === "selection" && isParlay(item.value)),
        )
      : zoneView === "Parlays"
        ? timeline.filter(
            (item) => item.kind === "selection" && isParlay(item.value),
          )
        : zoneView === "Wins"
          ? timeline.filter(
              (item) =>
                (item.kind === "post" && isWinPost(item.value)) ||
                (item.kind === "selection" &&
                  BILLS_WIN_IDS.includes(item.value.id)),
            )
          : timeline;
  return (
    <Shell active="feed">
      <ZoneNav active={zoneView} />
      <div
        className={`vq-feed ${access.allowed && !access.admin ? "member-watermarked" : ""}`}
        style={
          {
            "--member-watermark": JSON.stringify(
              `VEGAS QUANT · ${access.member_code || ""}`,
            ),
          } as CSSProperties
        }
      >
        <header className="feed-head">
          <div>
            <h1>The Zone</h1>
            <p>Research, injury news and legs we like.</p>
          </div>
          <Link href="/saved" className="text-link">
            Saved legs →
          </Link>
        </header>
        <HowItWorks />
        <details className="zone-extra-filters">
          <summary>More research filters</summary>
          <nav className="feed-filters" aria-label="Filter feed">
            {categories.map((c) => (
              <button
                key={c}
                aria-pressed={filter === c}
                className={filter === c ? "selected" : ""}
                onClick={() => {
                  if (c === filter) return;
                  setPosts([]);
                  setFilter(c);
                  setLimit(pageSize);
                  setLoading(true);
                }}
              >
                {c}
              </button>
            ))}
          </nav>
        </details>

        {!loading && !access.allowed && !error && (
          <p className="feed-access-note">
            <Link href="/membership">Sign in or manage research access</Link> to
            see member research updates.
          </p>
        )}
        {loading && <p role="status">Entering The Zone…</p>}
        {!loading && (
          <>
            <div className="feed-stream">
              {visibleTimeline.slice(0, limit).map((item) => {
                const p = item.kind === "post" ? item.value : null;
                const content =
                  p?.market_label ===
                  "zone-win:ravens-falcons-full5-20261011" ? (
                    <RavensWinningSlip key={p.id} publishedAt={p.created_at} />
                  ) : p?.market_label === "zone-win:london-live6-20261011" ? (
                    <LondonWinningSlip
                      key={p.id}
                      publishedAt={p.created_at}
                      variant="live-six"
                    />
                  ) : p?.market_label === "zone-win:london-q1-20261011" ? (
                    <LondonWinningSlip key={p.id} publishedAt={p.created_at} />
                  ) : p?.result_leg_key && p.result_details ? (
                    <AutomaticResultCard
                      key={p.id}
                      details={p.result_details}
                      matchup={p.matchup}
                      publishedAt={p.created_at}
                    />
                  ) : p ? (
                    <article className="feed-post" key={p.id}>
                      <div className="feed-byline">
                        <span className="feed-avatar">
                          <BrandMark />
                        </span>
                        <div>
                          <strong>Vegas Quant Ultra</strong>
                          <time dateTime={p.created_at}>
                            {time(p.created_at)}
                          </time>
                        </div>
                        <Badge>{p.category}</Badge>
                      </div>
                      <h2>{p.title}</h2>
                      <div className="feed-summary">
                        <small>WHAT CHANGED</small>
                        <p>{p.summary}</p>
                      </div>
                      <details className="feed-post-details">
                        <summary>Read the case, market & next check ↓</summary>
                        <div className="feed-summary">
                          <small>WHY IT MATTERS · ANALYST READ</small>
                          <p>{p.why_watch}</p>
                        </div>
                        <div className="feed-matchup">
                          <div className="feed-teams">
                            <strong>{p.away_code}</strong>
                            <span>@</span>
                            <strong>{p.home_code}</strong>
                            <span className="feed-watch">
                              <Eye size={14} /> WATCHING
                            </span>
                          </div>
                          <p>{p.matchup}</p>
                          <div className="feed-price">
                            <small>
                              OBSERVED MARKET · NOT A RECOMMENDATION
                            </small>
                            <strong>{p.market_label}</strong>
                            <time dateTime={p.source_at}>
                              Snapshot {time(p.source_at)} · Prices may change
                            </time>
                          </div>
                        </div>
                        <div className="feed-next">
                          <Clock3 size={17} />
                          <div>
                            <small>NEXT CHECK</small>
                            <p>{p.next_check}</p>
                          </div>
                        </div>
                        <details className="feed-context">
                          <summary>
                            Sources & uncertainty <ChevronDown size={16} />
                          </summary>
                          <h3>What could change the read</h3>
                          <p>{p.caution}</p>
                          <a
                            href={p.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Source <ArrowUpRight size={14} />
                          </a>
                        </details>
                        <Link
                          className="feed-research"
                          href={
                            p.game?.slug
                              ? `/matchups/${p.game.slug}`
                              : `/matchups?q=${encodeURIComponent(p.matchup.split(" @ ")[0])}`
                          }
                        >
                          Open matchup research <ArrowUpRight size={16} />
                        </Link>
                      </details>
                    </article>
                  ) : item.kind === "edge" ? (
                    <EdgeReleaseCard key={item.key} release={item.value} />
                  ) : item.kind === "selection" &&
                    BILLS_WIN_IDS.includes(item.value.id) ? (
                    <BillsWinningSlip
                      publishedAt={item.value.created_at}
                      halftime={
                        item.value.id === "0d8e8f5a-2470-473b-9271-c396829bb429"
                      }
                    />
                  ) : item.kind === "selection" && isParlay(item.value) ? (
                    // Parlays show their card straight away; no collapsed drop header.
                    <div
                      className="zone-parlay"
                      key={item.key}
                      id={`release-${item.value.id}`}
                    >
                      <CandidateTracker snapshot={item.value} />
                    </div>
                  ) : item.kind === "selection" ? (
                    <details
                      className="zone-drop"
                      key={item.key}
                      id={`release-${item.value.id}`}
                      open={openRelease === item.value.id || undefined}
                    >
                      <summary>
                        <span className="eyebrow">
                          PICK DROP · {time(item.value.created_at)}
                        </span>
                        <strong>{item.value.title}</strong>
                        <span>
                          {item.value.candidates[0]?.parlay
                            ? `One parlay · ${item.value.candidates.filter((c) => !c.parlay).length} legs`
                            : `${item.value.candidates.length} ${item.value.candidates.length === 1 ? "selection" : "selections"}`}{" "}
                          ·{" "}
                          <span className="zone-expand">
                            <span aria-hidden="true">＋</span> Expand
                          </span>
                        </span>
                      </summary>
                      <CandidateTracker snapshot={item.value} />
                    </details>
                  ) : null;
                return (
                  <div className="zone-item" key={item.key}>
                    <SectionBoundary name="This update">
                      {content}
                    </SectionBoundary>
                    {p &&
                      !p.market_label.startsWith("zone-win:") &&
                      !p.result_details && (
                        <DownloadCard
                          title={p.title}
                          subtitle={p.matchup}
                          publishedAt={p.created_at}
                          sections={[
                            {
                              heading: p.market_label.startsWith("zone-win:")
                                ? "Result"
                                : "Summary",
                              text: p.summary,
                            },
                            {
                              heading: p.market_label.startsWith("zone-win:")
                                ? "Winning legs"
                                : "Analyst case",
                              text: p.why_watch.split(
                                " Original pregame release:",
                              )[0],
                            },
                            ...(!p.market_label.startsWith("zone-win:")
                              ? [
                                  {
                                    heading: "Observed market",
                                    text: p.market_label,
                                  },
                                ]
                              : []),
                            {
                              heading: "Source / uncertainty",
                              text: p.caution,
                            },
                            { heading: "Next check", text: p.next_check },
                            { heading: "Source", text: p.source_url },
                          ]}
                        />
                      )}
                  </div>
                );
              })}
            </div>
            {!visibleTimeline.length && !error && (
              <p className="feed-empty">
                No updates in this category yet. Check back as the next decision
                develops.
              </p>
            )}
            {visibleTimeline.length > limit && (
              <button
                className="secondary feed-more"
                onClick={() => setLimit((l) => l + pageSize)}
              >
                Load more updates
              </button>
            )}
          </>
        )}
        <details
          className="feed-featured"
          onToggle={(e) => setBoardOpen(e.currentTarget.open)}
        >
          <summary>Published leg board · All selections</summary>
          {boardOpen && <PublishedLegBoard />}
        </details>
        <details
          id="candidate-tracker"
          className="feed-featured"
          onToggle={(e) => setArchiveOpen(e.currentTarget.open)}
        >
          <summary>
            Research archive <span>Previous tickets ↓</span>
          </summary>
          {archiveOpen && <CandidateTracker archiveOnly />}
        </details>
        {error && (
          <div className="notice" role="alert">
            {error}{" "}
            <button className="text-link" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        {access.admin && (
          <details className="feed-publisher">
            <summary>Admin · Publish a feed update</summary>
            <p>
              Append-only. Publish a new post to clarify an earlier update. This
              does not publish an official wager.
            </p>
            <form className="member-form" onSubmit={publish}>
              <label>
                Category
                <select name="category">
                  {categories.slice(1).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {[
                ["title", "Headline", 160],
                ["matchup", "Matchup (Away @ Home)", 160],
                ["away_code", "Away abbreviation", 6],
                ["home_code", "Home abbreviation", 6],
                ["market_label", "Observed market / awaiting price", 180],
              ].map(([name, label, max]) => (
                <label key={String(name)}>
                  {label}
                  <input name={String(name)} required maxLength={Number(max)} />
                </label>
              ))}
              {[
                ["summary", "Quick read", 600],
                ["why_watch", "Why we’re watching", 2000],
                ["caution", "What could change the read", 2000],
                ["next_check", "Next check", 1000],
              ].map(([name, label, max]) => (
                <label key={String(name)}>
                  {label}
                  <textarea
                    name={String(name)}
                    required
                    maxLength={Number(max)}
                    rows={3}
                  />
                </label>
              ))}
              <label>
                Source URL
                <input
                  name="source_url"
                  type="url"
                  required
                  placeholder="https://"
                />
              </label>
              <label>
                Source observation time (your local time)
                <input name="source_at" type="datetime-local" required />
              </label>
              <button className="primary" disabled={saving}>
                {saving ? "Publishing…" : "Publish update"}
              </button>
              <p role="status">{notice}</p>
            </form>
          </details>
        )}
      </div>
    </Shell>
  );
}
