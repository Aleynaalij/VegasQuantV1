"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Eye,
  Clock3,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { Shell, Badge } from "./ui";
import BrandMark from "./brand-mark";
import PublishedLegBoard from "./published-leg-board";
import CandidateTracker from "./candidate-tracker";
import DailyUpdateNotice from "./daily-update-notice";
import EdgeReleaseCard, { type EdgeRelease } from "./edge-release";
import { supabase } from "@/lib/supabase";
import { noAccess, type Access } from "@/lib/membership";
import { time } from "@/lib/domain";

type Post = {
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
const pageSize = 12;
export default function ResearchFeed() {
  const [posts, setPosts] = useState<Post[]>([]),
    [access, setAccess] = useState<Access>(noAccess),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All"),
    [limit, setLimit] = useState(pageSize),
    [hasMore, setHasMore] = useState(false),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  const [releases, setReleases] = useState<{id:string;created_at:string}[]>([]);
  const [edgeRelease, setEdgeRelease] = useState<EdgeRelease | null>(null);
  const epoch = useRef(0);
  async function refresh() {
    const n = ++epoch.current;
    const legs = await supabase.from("candidate_releases").select("id,created_at").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
    if (n !== epoch.current) return;
    if (!legs.error) setReleases(legs.data || []);
    const a = await supabase.rpc("membership_status");
    if (n !== epoch.current) return;
    if (a.error) {
      setPosts([]);
      setEdgeRelease(null);
      setAccess(noAccess);
      setError("Couldn’t check access. Please retry.");
      setLoading(false);
      return;
    }
    const current = a.data as Access;
    setAccess(current);
    const edges = await supabase.rpc("published_edge_releases");
    if (n !== epoch.current) return;
    setEdgeRelease(
      edges.error ? null : (edges.data?.[0] as EdgeRelease) || null,
    );
    if (!current.allowed) {
      setPosts([]);
      setHasMore(false);
      setError(
        edges.error
          ? "Couldn’t refresh published edge picks. Please retry."
          : "",
      );
      setLoading(false);
      return;
    }
    let query = supabase
      .from("research_feed_posts")
      .select("*,game:games(slug)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (filter !== "All") query = query.eq("category", filter);
    const r = await query;
    if (n !== epoch.current) return;
    if (r.error) {
      setError("Couldn’t load the feed. Please retry.");
    } else {
      setPosts((r.data as Post[]).slice(0, limit));
      setHasMore(r.data.length > limit);
      setError("");
    }
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch.current;
      setPosts([]);
      setEdgeRelease(null);
      setAccess(noAccess);
      setLoading(true);
      setTimeout(() => void refresh(), 0);
    });
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      ++epoch.current;
      auth.data.subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, [filter, limit]);
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
  return (
    <Shell active="feed">
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
        <header className="feed-hero">
          <div className="feed-kicker">
            <BrandMark />
            <span>VEGAS QUANT ULTRA · THE FEED</span>
          </div>
          <h1 className="sr-only">The Feed</h1>
          <p>Game by game. The selection, the case and the risk.</p>
          <div className="feed-rule">
            <ShieldCheck size={16} />
            <span>Individual game legs · Pick of the Day lives on Home.</span>
          </div>
        </header>
        <Link href="/saved" className="text-link">Your saved legs →</Link>
        <details className="feed-featured"><summary>Published leg board · All selections</summary><PublishedLegBoard /></details>
        <DailyUpdateNotice />
            <nav className="feed-filters" aria-label="Filter feed">
              {categories.map((c) => (
                <button
                  key={c}
                  aria-pressed={filter === c}
                  className={filter === c ? "selected" : ""}
                  onClick={() => {
                    if (c === filter) return;
                    setFilter(c);
                    setLimit(pageSize);
                    setLoading(true);
                  }}
                >
                  {c}
                </button>
              ))}
            </nav>


        {!loading && !edgeRelease && !access.allowed && (
          <p className="notice">
            No edge release is available yet. Only qualifying published picks
            appear here—WAIT/PASS is a valid decision.
          </p>
        )}
        {loading && <p role="status">Opening your feed…</p>}
        {!loading && <>
            <div className="feed-stream">
              {[...posts.map(p=>({id:p.id,created_at:p.created_at,post:p,edge:null as EdgeRelease|null})), ...((filter==="All"||filter==="Watchlist")?releases.map(r=>({...r,post:null,edge:null as EdgeRelease|null})):[]), ...((filter==="All"||filter==="Decision")&&edgeRelease?[{id:edgeRelease.official_pick_id,created_at:edgeRelease.created_at,post:null,edge:edgeRelease}]:[])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id)).slice(0,limit).map(item => { const p=item.post; return p ? (
                <article className="feed-post" key={p.id}>
                  <div className="feed-byline">
                    <span className="feed-avatar">
                      <BrandMark />
                    </span>
                    <div>
                      <strong>Vegas Quant Ultra</strong>
                      <time dateTime={p.created_at}>{time(p.created_at)}</time>
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
                        <small>OBSERVED MARKET · NOT A RECOMMENDATION</small>
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
              ) : item.edge ? <EdgeReleaseCard key={item.id} release={item.edge} /> : <CandidateTracker key={item.id} releaseId={item.id} />; })}
            </div>
            {!posts.length && !(filter === "All" || filter === "Watchlist" ? releases.length : 0) && !error && (
              <p className="feed-empty">
                No updates in this category yet. Check back as the next decision
                develops.
              </p>
            )}
            {(hasMore || ((filter === "All" || filter === "Watchlist") && releases.length > limit) || posts.length + ((filter === "All" || filter === "Watchlist") ? releases.length : 0) > limit) && (
              <button
                className="secondary feed-more"
                onClick={() => setLimit((l) => l + pageSize)}
              >
                Load more updates
              </button>
            )}
        </>}
        <details id="candidate-tracker" className="feed-featured">
          <summary>
            Research archive <span>Previous tickets ↓</span>
          </summary>
          <CandidateTracker archiveOnly />
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
