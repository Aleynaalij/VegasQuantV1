"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { time } from "@/lib/domain";
import { SPORTS } from "@/lib/sports";
import { useStoryClock } from "@/lib/use-story-clock";
import {
  displayedStoryRead,
  stepStory,
  storyDetail,
  storyDiscussion,
  storyGroups,
  storyEligible,
  type StoryCursor,
  type StoryGroup,
  type StoryPost,
} from "@/lib/community-story-contracts";
import CommunityPhoto, { openCommunityPhoto } from "./community-photo";
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
    legs: Array.isArray(row.legs)
      ? row.legs.filter((l): l is string => typeof l === "string")
      : [],
    photo_path:
      typeof row.photo_path === "string" && row.photo_path
        ? row.photo_path
        : null,
  };
}
/**
 * How long a post stays up before the viewer moves on: about 200 words a minute to read it, never
 * under 6 seconds. Long posts are never cut off: if the text runs past the screen, the timer also
 * holds until it has been scrolled to the end.
 */
const MIN_POST_MS = 6000;
function readingMs(p: Content) {
  const words = `${p.title} ${p.body} ${p.legs.join(" ")}`.split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_POST_MS, Math.round((words / 200) * 60000) + 1500);
}
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type State =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "missing" | "error" }
  | {
      kind: "ready";
      groups: StoryGroup[];
      posts: Map<string, StoryPost & Content>;
    };

/**
 * Full-screen recent-posts viewer: the tapped member's posts oldest → newest, then the next member.
 * Built only from rows the signed-in viewer is authorized to read (`community_post` for the tapped
 * post, the bounded `community_feed` set for the sequence), grouped by author UUID. It never loops
 * and reports a post as read only after its content is on screen.
 *
 * Like Instagram, each post plays for its reading time (the current segment fills) and then the
 * viewer moves to the next post, then the next member, and closes after the last. The timer runs
 * only while an authorized post is fully shown (photo loaded) and nothing has asked it to wait:
 * press-and-hold, the Pause control or Space, a hidden tab, focus on the post's own actions or (once
 * the reader moves it there) on the header controls, or a long post not yet scrolled to its end. A
 * photo counts as shown only for the exact image instance on screen after the latest check. Previous, Next, Pause and Close stay as labelled controls.
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
  const clock = useStoryClock(
    state.kind === "ready"
      ? [...state.posts.values()].map((p) => p.created_at)
      : [],
  );
  const [cursor, setCursor] = useState<StoryCursor | null>(null);
  // Which image instance has loaded: post, authorization check and photo path. A re-check (focus,
  // clock renewal, re-arrival) remounts the image, so readiness never carries over to it.
  const [photoLoadedFor, setPhotoLoadedFor] = useState<string | null>(null);
  // Each post is re-checked with community_post before it is shown (deleted, blocked or newly
  // restricted posts drop out), and again when the window regains focus.
  // The answer of the latest check, tagged with the arrival/focus it belongs to. Content is shown
  // only when that tag matches the *current* arrival, computed during render (not in an effect),
  // so an approval from an earlier arrival or focus can never show the post, even for one frame.
  const [check, setCheck] = useState<{
    key: string;
    status: "ok" | "gone" | "error";
  } | null>(null);
  const session = useRef<{ viewerId: string | null; generation: number }>({
    viewerId: null,
    generation: 0,
  });
  const seen = useRef<string[]>([]);
  const closed = useRef(false);

  const pushed = useRef(false);
  const close = useCallback(
    (fromBack = false) => {
      if (closed.current) return;
      closed.current = true;
      dialog.current?.close();
      // Closing by button/Escape removes the history entry the viewer added, so Back is not wasted.
      if (!fromBack && pushed.current && window.location.hash === "#story")
        window.history.back();
      onClose();
    },
    [onClose],
  );

  // Browser Back closes the viewer: it adds one history entry (#story) on open, through the native
  // pushState the app router integrates with, and closes when that entry is popped.
  useEffect(() => {
    if (window.location.hash !== "#story") {
      window.history.pushState(
        window.history.state,
        "",
        window.location.pathname + window.location.search + "#story",
      );
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
    if (clock.now === null || state.kind === "ready") return;
    let live = true;
    const generation = ++session.current.generation;
    void (async () => {
      const s = await supabase.auth.getSession();
      const viewerId = s.data.session?.user.id ?? null;
      if (!live || generation !== session.current.generation) return;
      session.current.viewerId = viewerId;
      if (!viewerId) return close();
      try {
        seen.current = JSON.parse(
          localStorage.getItem(`vq-community-read:${viewerId}`) || "[]",
        );
        if (!Array.isArray(seen.current)) seen.current = [];
      } catch {
        seen.current = [];
      }
      const [detail, feed] = await Promise.all([
        supabase.rpc("community_post", { p_id: startPostId }),
        supabase.rpc("community_feed", {
          p_sport: "all",
          p_limit: 100,
          p_following: false,
        }),
      ]);
      if (!live || generation !== session.current.generation) return;
      const request = { viewerId, generation, postId: startPostId };
      const start = detail.error
        ? null
        : storyDetail(detail.data, request, session.current, clock.getNow());
      if (!start) {
        setState({
          kind: "unavailable",
          reason: detail.error ? "error" : "missing",
        });
        return;
      }
      const rows: Record<string, unknown>[] = [
        detail.data as Record<string, unknown>,
        ...(feed.error || !Array.isArray(feed.data)
          ? []
          : (feed.data as Record<string, unknown>[])),
      ];
      const posts = new Map<string, StoryPost & Content>();
      for (const row of rows) {
        const id = typeof row.id === "string" ? row.id : "";
        const post = storyDetail(
          row,
          { viewerId, generation, postId: id },
          session.current,
          clock.getNow(),
        );
        if (post && !posts.has(post.id))
          posts.set(post.id, { ...post, ...content(row) });
      }
      // A post seen twice must be the same post: storyGroups drops conflicting duplicates.
      const groups = storyGroups(
        [...posts.values()].map(
          ({ id, user_id, author_name, sport, created_at }) => ({
            id,
            user_id,
            author_name,
            sport,
            created_at,
          }),
        ),
        clock.getNow(),
      );
      setState({ kind: "ready", groups, posts });
      // Enter this member's posts in order: their oldest post not yet read (or their first post
      // when all are read), so Next plays through every post of theirs before the next member.
      const own = groups.find((g) => g.authorId === start.user_id)?.posts ?? [];
      const entry =
        own.find((p) => !seen.current.includes(p.id)) ?? own[0] ?? start;
      setCursor({ authorId: start.user_id, postId: entry.id });
    })();
    return () => {
      live = false;
      session.current.generation++;
    };
  }, [startPostId, close, clock.version, clock.getNow]);

  // Account revocation stays subscribed even while clock synchronization is pending/failed.
  useEffect(
    () =>
      onUserChange(() => {
        session.current.generation++;
        session.current.viewerId = null;
        setState({ kind: "loading" });
        setCursor(null);
        close();
      }),
    [close],
  );

  const [focusTick, setFocusTick] = useState(0);
  // Each move (Previous/Next) is a new arrival, even back onto a post checked before.
  const [arrival, setArrival] = useState(0);
  useEffect(() => {
    const onFocus = () => setFocusTick((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const currentId = cursor?.postId;
  // Every arrival (entry, re-entry, Previous/Next) and every focus is its own check: the post is
  // hidden ("Checking this post…") until *this* check answers, and only the newest check counts,
  // so an earlier success can never show content while a newer check is pending or denied.
  const checkSeq = useRef(0);
  useEffect(() => {
    if (state.kind !== "ready" || !currentId || clock.now === null) return;
    let live = true;
    const n = ++checkSeq.current;
    const generation = session.current.generation;
    const key = `${currentId}|${focusTick}|${arrival}|${clock.version}`;
    void (async () => {
      const r = await supabase.rpc("community_post", { p_id: currentId });
      if (
        !live ||
        n !== checkSeq.current ||
        generation !== session.current.generation
      )
        return;
      const viewerId = session.current.viewerId || "";
      const fresh = r.error
        ? null
        : storyDetail(
            r.data,
            { viewerId, generation, postId: currentId },
            session.current,
            clock.getNow(),
          );
      if (fresh) {
        const row = r.data as Record<string, unknown>;
        setState((st) => {
          if (st.kind !== "ready") return st;
          const posts = new Map(st.posts);
          posts.set(fresh.id, { ...fresh, ...content(row) });
          return { ...st, posts };
        });
      }
      setCheck({ key, status: fresh ? "ok" : r.error ? "error" : "gone" });
    })();
    return () => {
      live = false;
    };
    // focusTick re-checks the post on screen when the window regains focus.
  }, [state.kind, currentId, focusTick, arrival, clock.version, clock.getNow]);

  const status =
    currentId &&
    check?.key === `${currentId}|${focusTick}|${arrival}|${clock.version}`
      ? check.status
      : undefined;
  const candidate =
    state.kind === "ready" && cursor && status === "ok"
      ? (state.posts.get(cursor.postId) ?? null)
      : null;
  const post =
    candidate && storyEligible(candidate.created_at, clock.now)
      ? candidate
      : null;
  const group =
    state.kind === "ready" && cursor
      ? state.groups
          .map((g) => ({
            ...g,
            posts: g.posts.filter((p) =>
              storyEligible(p.created_at, clock.now),
            ),
          }))
          .find((g) => g.authorId === cursor.authorId)
      : undefined;
  const index =
    group && cursor ? group.posts.findIndex((p) => p.id === cursor.postId) : -1;
  const prev =
    state.kind === "ready" && cursor
      ? stepStory(state.groups, cursor, -1, clock.now)
      : null;
  const next =
    state.kind === "ready" && cursor
      ? stepStory(state.groups, cursor, 1, clock.now)
      : null;
  const nextAuthor =
    next && next.authorId !== cursor?.authorId && state.kind === "ready"
      ? state.posts.get(next.postId)?.author_name
      : null;
  const textShown = Boolean(
    post && (post.title.trim() || post.body.trim() || post.legs.length),
  );

  // Read only once meaningful content is on screen: text after it renders, a photo-only post
  // after its photo loads. A failed or unavailable post is never marked read.
  // The image instance on screen now. Its load callback only counts while it is still current, so a
  // late load from a replaced or reauthorized image never marks the new one ready.
  const photoKey =
    post?.photo_path && currentId
      ? `${currentId}|${focusTick}|${arrival}|${clock.version}|${post.photo_path}`
      : null;
  const currentPhoto = useRef<string | null>(null);
  currentPhoto.current = photoKey;
  const photoLoaded = photoKey !== null && photoLoadedFor === photoKey;
  useEffect(() => {
    if (!post || !cursor) return;
    const displayed = textShown || photoLoaded;
    if (!displayed) return;
    const frame = requestAnimationFrame(() => {
      const current = session.current;
      const request = {
        viewerId: current.viewerId || "",
        generation: current.generation,
        postId: post.id,
      };
      const nextSeen = displayedStoryRead(
        seen.current,
        post,
        request,
        current,
        true,
        clock.getNow(),
      );
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
    if (!to) return;
    setArrival((n) => n + 1);
    setCursor(to);
  }, []);
  useEffect(() => {
    if (state.kind !== "ready" || !cursor || clock.now === null) return;
    const current = state.posts.get(cursor.postId);
    if (current && !storyEligible(current.created_at, clock.now)) {
      const next = stepStory(state.groups, cursor, 1, clock.now);
      if (next) go(next);
      else {
        setCursor(null);
        setState({ kind: "unavailable", reason: "missing" });
      }
    }
  }, [state, cursor, clock.now, go]);
  // --- Auto-advance -------------------------------------------------------------------------
  // Shown means authorized, on screen and complete: text rendered, and any photo loaded.
  const shown = Boolean(post && (post.photo_path ? photoLoaded : textShown));
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [actionFocus, setActionFocus] = useState(false);
  // Header controls pause only when the reader moved focus there (Tab), not when the dialog's own
  // initial focus lands on Close at open, which would stop autoplay before it began. Choosing Play
  // while focused there resumes until focus leaves the header.
  const [headerFocus, setHeaderFocus] = useState(false);
  const [playOverride, setPlayOverride] = useState(false);
  const tabbing = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") tabbing.current = true;
    };
    const onPointer = () => {
      tabbing.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  const [unread, setUnread] = useState(false); // long text not yet scrolled to its end
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  // Every arrival starts its post from zero.
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
    // The previous post's actions are gone, so their focus no longer holds the timer.
    setActionFocus(false);
  }, [cursor?.postId, arrival]);
  // A long post holds until its last line of text has been on screen.
  const measure = useCallback(() => {
    const el = body.current;
    // The post's last line of text, in document order (title, body, then selections).
    const parts = el?.querySelectorAll<HTMLElement>(".story-post h2, .story-text, .story-legs");
    const last = parts?.length ? parts[parts.length - 1] : null;
    if (!el || !last) return setUnread(false);
    const lastBox = last.getBoundingClientRect();
    const view = el.getBoundingClientRect();
    setUnread(lastBox.bottom > view.bottom + 2);
  }, []);
  useEffect(() => {
    if (!shown) return;
    measure();
    const el = body.current;
    el?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [shown, post?.id, measure]);
  // What the Pause/Play control reports: an explicit pause, or focus resting on the header controls.
  const holding = paused || (headerFocus && !playOverride);
  const running = shown && !holding && !held && !hidden && !actionFocus && !unread;
  const advance = useRef(() => {});
  advance.current = () => {
    if (moves.current.next) go(moves.current.next);
    else close();
  };
  useEffect(() => {
    if (!running || !post) return;
    const total = readingMs(post);
    const stepped = reducedMotion();
    let last = performance.now();
    let painted = 0;
    let frame = 0;
    const tick = (t: number) => {
      elapsed.current += t - last;
      last = t;
      const p = Math.min(1, elapsed.current / total);
      // Reduced motion: the bar steps once a second instead of gliding.
      if (!stepped || t - painted >= 1000 || p >= 1) {
        setProgress(p);
        painted = t;
      }
      if (p >= 1) return advance.current();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, post]);

  // Arrow keys work wherever focus sits while the viewer is open (a nav button that becomes
  // disabled at either end drops focus to the page), except inside a control that uses them.
  const moves = useRef({ prev, next });
  moves.current = { prev, next };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input,textarea,select,[contenteditable=true]"))
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(moves.current.next);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(moves.current.prev);
      } else if (e.key === " " && !target?.closest?.("button,a,summary")) {
        e.preventDefault();
        setPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  // Instagram-style taps on the post area: the right half goes forward one post, the left half
  // back one. Controls, links, media controls, text selection and drags (scrolling) never
  // navigate, and one gesture moves at most one step (click fires once per tap or mouse click).
  const tapStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const onTapDown = (e: React.PointerEvent<HTMLDivElement>) => {
    tapStart.current = e.isPrimary ? { x: e.clientX, y: e.clientY, at: performance.now() } : null;
    // Press-and-hold pauses; letting go (anywhere) resumes.
    if (e.isPrimary) setHeld(true);
  };
  useEffect(() => {
    if (!held) return;
    const release = () => setHeld(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [held]);
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const start = tapStart.current;
    tapStart.current = null;
    if (state.kind !== "ready" || e.defaultPrevented || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (
      target?.closest?.(
        "a,button,input,textarea,select,summary,label,video,audio,[contenteditable=true],[data-story-no-tap]",
      )
    )
      return;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10)
      return;
    // A long press was a pause, not a tap.
    if (start && performance.now() - start.at > 500) return;
    if ((window.getSelection()?.toString() ?? "").trim()) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(
      e.clientX < box.left + box.width / 2
        ? moves.current.prev
        : moves.current.next,
    );
  };
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
        <header
          className="story-viewer-head"
          onFocus={() => {
            if (tabbing.current) setHeaderFocus(true);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setHeaderFocus(false);
              setPlayOverride(false);
            }
          }}
        >
          {group ? (
            <ol
              className="story-segments"
              aria-label={`${group.posts.length} recent post${group.posts.length === 1 ? "" : "s"} from ${post?.author_name ?? "this member"}`}
            >
              {group.posts.map((p, i) => (
                <li
                  key={p.id}
                  className={i < index ? "done" : i === index ? "current" : ""}
                  aria-current={i === index ? "step" : undefined}
                  style={i === index ? ({ "--story-progress": progress } as React.CSSProperties) : undefined}
                >
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
                  {group && group.posts.length > 1
                    ? ` · ${index + 1} of ${group.posts.length}`
                    : ""}
                </small>
              </>
            ) : (
              <b>Recent posts</b>
            )}
            <div className="story-controls">
              {state.kind === "ready" ? (
                <>
                  <button
                    ref={prevButton}
                    type="button"
                    className="story-control"
                    onClick={() => go(prev)}
                    disabled={!prev}
                    aria-label="Previous post"
                  >
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                  <button
                    ref={nextButton}
                    type="button"
                    className="story-control"
                    onClick={() => go(next)}
                    disabled={!next}
                    aria-label={nextAuthor ? `Next post, from ${nextAuthor}` : "Next post"}
                  >
                    <ChevronRight size={22} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="story-control"
                    onClick={() => {
                      // Play is an explicit request: it wins over focus resting on the header.
                      if (holding) {
                        setPaused(false);
                        setPlayOverride(true);
                      } else setPaused(true);
                    }}
                    aria-pressed={holding}
                    aria-label={holding ? "Play: move on automatically" : "Pause: stay on this post"}
                  >
                    {holding ? <Play size={20} aria-hidden="true" /> : <Pause size={20} aria-hidden="true" />}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="story-close"
                onClick={() => close()}
                aria-label="Close recent posts"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        {/* Taps are a pointer shortcut; the Previous/Next/Pause controls above and the Arrow and
            Space keys stay the accessible way to move, so the tap area itself is not a control. */}
        <div
          ref={body}
          className="story-viewer-body"
          aria-live="polite"
          onPointerDown={onTapDown}
          onClick={onTap}
        >
          {clock.now === null ? (
            <p role="status">
              {clock.failed
                ? "Story time could not be verified. Retrying shortly."
                : "Checking story time…"}
              {clock.failed ? <button type="button" onClick={clock.retry}>Retry story time</button> : null}
            </p>
          ) : state.kind === "loading" ? (
            <p role="status">Loading post…</p>
          ) : state.kind === "unavailable" ? (
            <div className="story-unavailable">
              <p role="alert">
                {state.reason === "error"
                  ? "This post could not load. Check your connection and try again."
                  : "This post is no longer available."}
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => close()}
              >
                Close
              </button>
            </div>
          ) : post ? (
            <article className="story-post" key={post.id}>
              <span className="story-label">
                Member post · not Vegas Quant research
              </span>
              {post.title.trim() ? <h2>{post.title}</h2> : null}
              {post.body.trim() ? (
                <p className="story-text">{post.body}</p>
              ) : null}
              {post.legs.length ? (
                <ul className="story-legs" aria-label="Selections in this post">
                  {post.legs.map((leg, i) => (
                    <li key={`${i}-${leg}`}>{leg}</li>
                  ))}
                </ul>
              ) : null}
              {post.photo_path ? (
                <CommunityPhoto
                  path={post.photo_path}
                  title={post.title || `${post.author_name}'s post`}
                  key={photoKey ?? undefined}
                  onLoaded={() => {
                    const loaded = photoKey;
                    if (loaded && loaded === currentPhoto.current) setPhotoLoadedFor(loaded);
                  }}
                  openable={false}
                />
              ) : null}
              <div
                className="story-actions"
                data-story-no-tap
                onFocus={() => setActionFocus(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActionFocus(false);
                }}
              >
                {post.photo_path && photoLoaded ? (
                  <button
                    type="button"
                    className="secondary story-open-photo"
                    onClick={() => void openCommunityPhoto(post.photo_path!)}
                  >
                    Open full photo
                  </button>
                ) : null}
                <Link
                  className="story-discussion"
                  href={storyDiscussion(post)}
                  onClick={(e) => {
                    // Leave the viewer's history entry first, then open the discussion, so Back
                    // from the discussion returns to the page rather than to a closed viewer.
                    e.preventDefault();
                    const href = storyDiscussion(post);
                    if (pushed.current && window.location.hash === "#story")
                      window.addEventListener(
                        "popstate",
                        () => router.push(href),
                        { once: true },
                      );
                    else setTimeout(() => router.push(href), 0);
                    close();
                  }}
                >
                  View discussion →
                </Link>
                <p className="story-gambly">
                  <b>Open with Gambly isn’t available for member posts.</b> Only
                  plays Vegas Quant published with an exact market can be copied
                  to Gambly; a member’s text or screenshot can’t be matched to
                  one.
                </p>
              </div>
            </article>
          ) : status === "gone" ? (
            <p role="alert">This post is no longer available.</p>
          ) : status === "error" ? (
            <p role="alert">
              This post could not load. Check your connection, then move on or
              try again.
            </p>
          ) : (
            <p role="status">Checking this post…</p>
          )}
        </div>

      </div>
    </dialog>
  );
}
