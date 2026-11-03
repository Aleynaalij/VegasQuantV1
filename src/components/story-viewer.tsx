"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time } from "@/lib/domain";
import { SPORTS } from "@/lib/sports";
import {
  displayedStoryRead,
  stepStory,
  storyDetail,
  storyDiscussion,
  storyGroups,
  type StoryCursor,
  type StoryGroup,
  type StoryPost,
} from "@/lib/community-story-contracts";
import CommunityPhoto from "./community-photo";
import "@/app/story-viewer.css";

/** What the viewer renders: authorized post content only (no counts, emails or other fields). */
type Content = {
  title: string;
  body: string;
  legs: string[];
  photo_path: string | null;
};
const text = (v: unknown) => (typeof v === "string" ? v : "");
function content(row: Record<string, unknown>): Content {
  return {
    title: text(row.title),
    body: text(row.body),
    legs: Array.isArray(row.legs) ? row.legs.filter((l): l is string => typeof l === "string") : [],
    photo_path: typeof row.photo_path === "string" && row.photo_path ? row.photo_path : null,
  };
}
type State =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "missing" | "error" }
  | { kind: "ready"; groups: StoryGroup[]; posts: Map<string, StoryPost & Content> };

/**
 * Full-screen recent-posts viewer: the tapped member's posts oldest → newest, then the next member.
 * Built only from rows the signed-in viewer is authorized to read (`community_post` for the tapped
 * post, the bounded `community_feed` set for the sequence), grouped by author UUID. It never loops,
 * never advances on its own, and reports a post as read only after its content is on screen.
 */
export default function StoryViewer({
  startPostId,
  onClose,
  onRead,
}: {
  startPostId: string;
  onClose: () => void;
  onRead: (seen: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [cursor, setCursor] = useState<StoryCursor | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  // Each post is re-checked with community_post before it is shown (deleted, blocked or newly
  // restricted posts drop out), and again when the window regains focus.
  const [checked, setChecked] = useState<Record<string, "ok" | "gone" | "error">>({});
  const session = useRef<{ viewerId: string | null; generation: number }>({ viewerId: null, generation: 0 });
  const seen = useRef<string[]>([]);
  const closed = useRef(false);

  const pushed = useRef(false);
  const close = useCallback((fromBack = false) => {
    if (closed.current) return;
    closed.current = true;
    dialog.current?.close();
    // Closing by button/Escape removes the history entry the viewer added, so Back is not wasted.
    if (!fromBack && pushed.current && window.location.hash === "#story") window.history.back();
    onClose();
  }, [onClose]);

  // Browser Back closes the viewer: it adds one history entry (#story) on open, through the native
  // pushState the app router integrates with, and closes when that entry is popped.
  useEffect(() => {
    if (window.location.hash !== "#story") {
      window.history.pushState(window.history.state, "", window.location.pathname + window.location.search + "#story");
      pushed.current = true;
    }
    const onPop = () => {
      if (window.location.hash !== "#story") close(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [close]);

  // Open as a modal (focus stays inside; Escape is handled below so it closes exactly once).
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // Load the tapped post and the authorized sequence for the current account only.
  useEffect(() => {
    let live = true;
    const generation = ++session.current.generation;
    void (async () => {
      const s = await supabase.auth.getSession();
      const viewerId = s.data.session?.user.id ?? null;
      if (!live || generation !== session.current.generation) return;
      session.current.viewerId = viewerId;
      if (!viewerId) return close();
      try {
        seen.current = JSON.parse(localStorage.getItem(`vq-community-read:${viewerId}`) || "[]");
        if (!Array.isArray(seen.current)) seen.current = [];
      } catch {
        seen.current = [];
      }
      const [detail, feed] = await Promise.all([
        supabase.rpc("community_post", { p_id: startPostId }),
        supabase.rpc("community_feed", { p_sport: "all", p_limit: 100, p_following: false }),
      ]);
      if (!live || generation !== session.current.generation) return;
      const request = { viewerId, generation, postId: startPostId };
      const start = detail.error ? null : storyDetail(detail.data, request, session.current);
      if (!start) {
        setState({ kind: "unavailable", reason: detail.error ? "error" : "missing" });
        return;
      }
      const rows: Record<string, unknown>[] = [
        detail.data as Record<string, unknown>,
        ...(feed.error || !Array.isArray(feed.data) ? [] : (feed.data as Record<string, unknown>[])),
      ];
      const posts = new Map<string, StoryPost & Content>();
      for (const row of rows) {
        const id = typeof row.id === "string" ? row.id : "";
        const post = storyDetail(row, { viewerId, generation, postId: id }, session.current);
        if (post && !posts.has(post.id)) posts.set(post.id, { ...post, ...content(row) });
      }
      // A post seen twice must be the same post: storyGroups drops conflicting duplicates.
      const groups = storyGroups([...posts.values()].map(({ id, user_id, author_name, sport, created_at }) => ({ id, user_id, author_name, sport, created_at })));
      setState({ kind: "ready", groups, posts });
      setChecked({ [start.id]: "ok" });
      // Enter this member's posts in order: their oldest post not yet read (or their first post
      // when all are read), so Next plays through every post of theirs before the next member.
      const own = groups.find((g) => g.authorId === start.user_id)?.posts ?? [];
      const entry = own.find((p) => !seen.current.includes(p.id)) ?? own[0] ?? start;
      setCursor({ authorId: start.user_id, postId: entry.id });
    })();
    // A different account (or signing out) must never see this account's posts.
    const stop = onUserChange(() => {
      session.current.generation++;
      setState({ kind: "loading" });
      setCursor(null);
      close();
    });
    return () => {
      live = false;
      session.current.generation++;
      stop();
    };
  }, [startPostId, close]);

  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setFocusTick((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const currentId = cursor?.postId;
  useEffect(() => {
    if (state.kind !== "ready" || !currentId) return;
    let live = true;
    const generation = session.current.generation;
    void (async () => {
      const r = await supabase.rpc("community_post", { p_id: currentId });
      if (!live || generation !== session.current.generation) return;
      const viewerId = session.current.viewerId || "";
      const fresh = r.error ? null : storyDetail(r.data, { viewerId, generation, postId: currentId }, session.current);
      if (fresh) {
        const row = r.data as Record<string, unknown>;
        setState((st) => {
          if (st.kind !== "ready") return st;
          const posts = new Map(st.posts);
          posts.set(fresh.id, { ...fresh, ...content(row) });
          return { ...st, posts };
        });
      }
      setChecked((c) => ({ ...c, [currentId]: fresh ? "ok" : r.error ? "error" : "gone" }));
    })();
    return () => {
      live = false;
    };
    // focusTick re-checks the post on screen when the window regains focus.
  }, [state.kind, currentId, focusTick]);

  const status = currentId ? checked[currentId] : undefined;
  const post = state.kind === "ready" && cursor && status === "ok" ? state.posts.get(cursor.postId) ?? null : null;
  const group = state.kind === "ready" && cursor ? state.groups.find((g) => g.authorId === cursor.authorId) : undefined;
  const index = group && cursor ? group.posts.findIndex((p) => p.id === cursor.postId) : -1;
  const prev = state.kind === "ready" && cursor ? stepStory(state.groups, cursor, -1) : null;
  const next = state.kind === "ready" && cursor ? stepStory(state.groups, cursor, 1) : null;
  const nextAuthor = next && next.authorId !== cursor?.authorId && state.kind === "ready"
    ? state.posts.get(next.postId)?.author_name
    : null;
  const textShown = Boolean(post && (post.title.trim() || post.body.trim() || post.legs.length));

  // Read only once meaningful content is on screen: text after it renders, a photo-only post
  // after its photo loads. A failed or unavailable post is never marked read.
  useEffect(() => {
    setPhotoLoaded(false);
  }, [cursor?.postId]);
  useEffect(() => {
    if (!post || !cursor) return;
    const displayed = textShown || photoLoaded;
    if (!displayed) return;
    const frame = requestAnimationFrame(() => {
      const current = session.current;
      const request = { viewerId: current.viewerId || "", generation: current.generation, postId: post.id };
      const nextSeen = displayedStoryRead(seen.current, post, request, current, true);
      // Compare by ID, not length: at the 2,000-ID cap the length stays the same while the oldest
      // ID is evicted for this one.
      if (!seen.current.includes(post.id) && nextSeen.includes(post.id)) {
        seen.current = nextSeen;
        onRead(nextSeen);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [post, cursor, textShown, photoLoaded, onRead]);

  const go = useCallback((to: StoryCursor | null) => {
    if (to) setCursor(to);
  }, []);
  // Arrow keys work wherever focus sits while the viewer is open (a nav button that becomes
  // disabled at either end drops focus to the page), except inside a control that uses them.
  const moves = useRef({ prev, next });
  moves.current = { prev, next };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(moves.current.next);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(moves.current.prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  // Keep focus inside the viewer when the focused nav button becomes disabled at an end.
  const prevButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!prev && active === prevButton.current) nextButton.current?.focus();
    if (!next && active === nextButton.current) prevButton.current?.focus();
  }, [prev, next]);

  return (
    <dialog
      ref={dialog}
      className="story-viewer"
      aria-label="Recent community posts"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="story-viewer-frame">
        <header className="story-viewer-head">
          {group ? (
            <ol className="story-segments" aria-label={`${group.posts.length} recent post${group.posts.length === 1 ? "" : "s"} from ${post?.author_name ?? "this member"}`}>
              {group.posts.map((p, i) => (
                <li key={p.id} className={i < index ? "done" : i === index ? "current" : ""} aria-current={i === index ? "step" : undefined}>
                  <span className="sr-only">Post {i + 1}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="story-viewer-meta">
            {post ? (
              <>
                <b>{post.author_name}</b>
                <small>
                  {SPORTS[post.sport].label} · {time(post.created_at)}
                  {group && group.posts.length > 1 ? ` · ${index + 1} of ${group.posts.length}` : ""}
                </small>
              </>
            ) : (
              <b>Recent posts</b>
            )}
            <button type="button" className="story-close" onClick={() => close()} aria-label="Close recent posts">
              <X size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="story-viewer-body" aria-live="polite">
          {state.kind === "loading" ? (
            <p role="status">Loading post…</p>
          ) : state.kind === "unavailable" ? (
            <div className="story-unavailable">
              <p role="alert">
                {state.reason === "error"
                  ? "This post could not load. Check your connection and try again."
                  : "This post is no longer available."}
              </p>
              <button type="button" className="secondary" onClick={() => close()}>
                Close
              </button>
            </div>
          ) : post ? (
            <article className="story-post" key={post.id}>
              <span className="story-label">Member post · not Vegas Quant research</span>
              {post.title.trim() ? <h2>{post.title}</h2> : null}
              {post.body.trim() ? <p className="story-text">{post.body}</p> : null}
              {post.legs.length ? (
                <ul className="story-legs" aria-label="Selections in this post">
                  {post.legs.map((leg, i) => (
                    <li key={`${i}-${leg}`}>{leg}</li>
                  ))}
                </ul>
              ) : null}
              {post.photo_path ? (
                <CommunityPhoto path={post.photo_path} title={post.title || `${post.author_name}'s post`} onLoaded={() => setPhotoLoaded(true)} />
              ) : null}
              <div className="story-actions">
                <Link
                  className="story-discussion"
                  href={storyDiscussion(post)}
                  onClick={(e) => {
                    // Leave the viewer's history entry first, then open the discussion, so Back
                    // from the discussion returns to the page rather than to a closed viewer.
                    e.preventDefault();
                    const href = storyDiscussion(post);
                    if (pushed.current && window.location.hash === "#story")
                      window.addEventListener("popstate", () => router.push(href), { once: true });
                    else setTimeout(() => router.push(href), 0);
                    close();
                  }}
                >
                  View discussion →
                </Link>
                <p className="story-gambly">
                  <b>Open with Gambly isn’t available for member posts.</b> Only plays Vegas Quant
                  published with an exact market can be copied to Gambly; a member’s text or
                  screenshot can’t be matched to one.
                </p>
              </div>
            </article>
          ) : (
            status === "gone" ? (
              <p role="alert">This post is no longer available.</p>
            ) : status === "error" ? (
              <p role="alert">This post could not load. Check your connection, then move on or try again.</p>
            ) : (
              <p role="status">Checking this post…</p>
            )
          )}
        </div>

        {state.kind === "ready" ? (
          <nav className="story-nav" aria-label="Move between posts">
            <button ref={prevButton} type="button" onClick={() => go(prev)} disabled={!prev} aria-label="Previous post">
              <ChevronLeft size={22} aria-hidden="true" /> Previous
            </button>
            <button ref={nextButton} type="button" onClick={() => go(next)} disabled={!next} aria-label={nextAuthor ? `Next post, from ${nextAuthor}` : "Next post"}>
              {nextAuthor ? `Next · ${nextAuthor}` : next ? "Next" : "No more posts"}
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
    </dialog>
  );
}
