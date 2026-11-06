"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StoryViewer from "./story-viewer";
import { buildStoryPreview, type StoryPreview } from "@/lib/story-preview";
import { useStoryClock } from "@/lib/use-story-clock";
import { supabase } from "@/lib/supabase";
import "@/app/lobby-stories.css";

import {
  type CommunityActivity,
  unreadStories,
  readStories,
  storyReadKey,
} from "@/lib/community-stories";

/** Story presentation expires after 24 hours; the underlying community post remains. */
export default function CommunityStories({
  placement = "sport-strip",
}: {
  placement?: "sport-strip" | "lobby";
}) {
  // Explicit Home-only test mode; never changes ordinary visitors' story rails.
  const [previewMode, setPreviewMode] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [previewDenied, setPreviewDenied] = useState(false);
  useEffect(() => {
    const sync = () => setPreviewMode(placement === "lobby" && new URLSearchParams(window.location.search).get("storyPreview") === "1");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [placement]);
  const [members, setMembers] = useState<CommunityActivity[]>([]);
  const [failed, setFailed] = useState(false);
  // Stories are for signed-in members: a visitor never gets a stories Retry, only the Zone link.
  const [signedIn, setSignedIn] = useState(false);
  const generation = useRef(0);
  const viewer = useRef<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    if (previewMode === null) return;
    let live = true;
    const load = async () => {
      const version = ++generation.current;
      // Do not show cached identity metadata while authorization is rechecked.
      setMembers([]);
      setPreview(null);
      const session = await supabase.auth.getSession();
      if (!live || version !== generation.current) return;
      viewer.current = session.data.session?.user.id || null;
      setSignedIn(Boolean(viewer.current));
      setSeen(!previewMode && viewer.current ? readStories(viewer.current) : []);
      if (!session.data.session) {
        setMembers([]);
        setFailed(false);
        return;
      }
      if (previewMode) {
        try {
          const admin = await supabase.rpc("is_admin");
          if (!live || version !== generation.current) return;
          if (admin.error) {
            setFailed(true);
            setPreviewDenied(false);
            return;
          }
          if (admin.data !== true) {
            setFailed(false);
            setPreviewDenied(true);
            return;
          }
          setPreviewDenied(false);
          const [roster, time] = await Promise.all([
            supabase.rpc("community_roster", { p_challenge_id: null }),
            supabase.rpc("community_story_clock"),
          ]);
          if (!live || version !== generation.current) return;
          if (roster.error || time.error || time.data?.version !== 1) throw Error("Preview unavailable");
          const example = buildStoryPreview(viewer.current!, roster.data, time.data.server_now);
          setPreviewDenied(false);
          setFailed(false);
          setPreview(example);
          setMembers(example.members);
        } catch {
          if (live && version === generation.current) {
            setFailed(true);
          }
        }
        return;
      }
      let result;
      try {
        result = await supabase.rpc("community_activity");
      } catch {
        if (live && version === generation.current) setFailed(true);
        return;
      }
      if (!live || version !== generation.current) return;
      setFailed(Boolean(result.error));
      setMembers(result.error ? [] : result.data || []);
    };
    const refresh = () => {
      generation.current++;
      setMembers([]);
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = setInterval(refresh, 30000);
    const syncRead = (event: StorageEvent) => {
      if (!previewMode && viewer.current && event.key === storyReadKey(viewer.current))
        setSeen(readStories(viewer.current));
    };
    window.addEventListener("storage", syncRead);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("vq-community-changed", refresh);
    const auth = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setMembers([]);
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      generation.current++;
      clearInterval(timer);
      window.removeEventListener("storage", syncRead);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("vq-community-changed", refresh);
      auth.data.subscription.unsubscribe();
    };
  }, [previewMode]);
  const clock = useStoryClock(
    members.flatMap((m) => (m.created_at ? [m.created_at] : [])),
  );
  const unread = unreadStories(members, previewMode ? [] : seen, clock.now);
  // The viewer opens on tap; a post is read only once the viewer has displayed it.
  const [open, setOpen] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<StoryPreview | undefined>();
  const opener = useRef<HTMLButtonElement | null>(null);
  const saveRead = useCallback((next: string[]) => {
    if (previewMode || !viewer.current) return;
    const merged = [
      ...new Set([...readStories(viewer.current), ...next]),
    ].slice(-2000);
    setSeen(merged);
    try {
      localStorage.setItem(
        storyReadKey(viewer.current),
        JSON.stringify(merged),
      );
    } catch {
      /* Keep this visit responsive if storage is disabled. */
    }
  }, [previewMode]);
  const origin = useRef<string | null>(null);
  useEffect(() => {
    // Remember the exact page URL (including its own #hash) before the viewer adds #story.
    if (open && window.location.hash !== "#story")
      origin.current =
        window.location.pathname +
        window.location.search +
        window.location.hash;
    // Browser Forward onto a closed viewer's #story entry: a closed viewer cannot be restored from
    // the URL, so step straight back to the page's own entry (exact URL, #hash included). Reopening
    // then reuses that forward slot, so open/Back/Forward cycles never accumulate entries.
    const tidy = () => {
      if (open || window.location.hash !== "#story") return;
      if (origin.current) window.history.back();
      else
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
    };
    // Only on real Back/Forward navigation: right after a close, the viewer's own history.back()
    // is still in flight and the URL still ends in #story, so acting here would step back twice.
    window.addEventListener("popstate", tidy);
    return () => window.removeEventListener("popstate", tidy);
  }, [open]);
  // A page loaded (or reloaded) with a leftover #story shows no viewer: drop the hash in place.
  useEffect(() => {
    if (window.location.hash === "#story")
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  const closeViewer = useCallback(() => {
    setOpen(null);
    setOpenPreview(undefined);
    // Return focus to the ring that opened the viewer, or the rail if that ring is now read.
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected
        ? opener.current
        : document.querySelector<HTMLElement>(
            ".community-stories button, .community-stories a",
          );
      target?.focus();
    });
  }, []);
  // Home gives signed-in members a dedicated rail below the sport rooms. Visitors
  // see neither a member preview nor an empty story row; all existing read gates stay above.
  if (placement === "lobby" && !signedIn) return null;
  return (
    <div
      className={`community-story-wrap${placement === "lobby" ? " lobby-community-stories" : ""}`}
      role={placement === "lobby" ? "region" : undefined}
      aria-label={placement === "lobby" ? "Recent member stories" : undefined}
      data-no-tab-swipe
    >
      {previewMode ? (
        <p className="story-preview-notice" role="status">
          <b>Admin story preview</b> · Test content only. Nothing is published.
          {preview ? ` ${preview.members.length} member${preview.members.length === 1 ? "" : "s"}${preview.members.length === 500 ? " (roster limit)" : ""}.` : ""}
          <a href="/" className="story-preview-exit">Exit preview</a>
        </p>
      ) : null}
      {placement !== "lobby" ? (
        <span className="story-divider" aria-hidden="true">
          |
        </span>
      ) : null}
      <div className="community-stories" aria-label="Recent community posts">
        {unread.map((member) => (
          <button
            type="button"
            className="community-story"
            key={member.post_id}
            onClick={(e) => {
              if (!unreadStories([member], previewMode ? [] : seen, clock.getNow()).length) return;
              setOpenPreview(previewMode && preview ? preview : undefined);
              opener.current = e.currentTarget;
              if (window.location.hash !== "#story")
                origin.current =
                  window.location.pathname +
                  window.location.search +
                  window.location.hash;
              setOpen(member.post_id);
            }}
            aria-haspopup="dialog"
            aria-label={`Open ${member.username}'s ${previewMode ? "test story" : "recent community posts"}`}
          >
            <span className="story-ring">
              {member.avatar ? (
                <img src={member.avatar} alt="" width={40} height={40} />
              ) : (
                <span>{member.username.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <small>{member.username}</small>
          </button>
        ))}
        {clock.failed && signedIn ? (
          <button type="button" className="story-empty" onClick={clock.retry}>
            Stories unavailable · Retry
          </button>
        ) : null}
        {previewMode && !unread.length ? (
          <span className="story-empty" role="status">
            {failed ? "Preview unavailable. Reload to retry." : previewDenied ? "Admin access required for story preview." : preview ? "No members in this roster." : "Checking preview access…"}
          </span>
        ) : null}
        {!previewMode && !unread.length ? (
          <Link className="story-empty" href="/community">
            {failed || clock.failed || clock.now === null
              ? "Open Community →"
              : members.length
                ? "All caught up · Community →"
                : "Start a conversation →"}
          </Link>
        ) : null}
      </div>
      {/* Rendered on <body>, outside either rail and its link styles. */}
      {open
        ? createPortal(
            <StoryViewer
              key={open}
              startPostId={open}
              preview={openPreview}
              previewRevoked={Boolean(previewMode && (previewDenied || failed))}
              onClose={closeViewer}
              onRead={saveRead}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
