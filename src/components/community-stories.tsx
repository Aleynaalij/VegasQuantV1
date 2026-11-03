"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import StoryViewer from "./story-viewer";
import { supabase } from "@/lib/supabase";

import {
  type CommunityActivity,
  unreadStories,
  readStories,
  storyReadKey,
} from "@/lib/community-stories";

/** Recent community posts, not online presence or disappearing stories. */
export default function CommunityStories() {
  const [members, setMembers] = useState<CommunityActivity[]>([]);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const viewer = useRef<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const version = ++generation.current;
      const session = await supabase.auth.getSession();
      if (!live || version !== generation.current) return;
      viewer.current = session.data.session?.user.id || null;
      setSeen(viewer.current ? readStories(viewer.current) : []);
      if (!session.data.session) {
        setMembers([]);
        setFailed(false);
        return;
      }
      const result = await supabase.rpc("community_activity");
      if (!live || version !== generation.current) return;
      setFailed(Boolean(result.error));
      setMembers(result.error ? [] : result.data || []);
    };
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = setInterval(refresh, 30000);
    const syncRead = (event: StorageEvent) => {
      if (viewer.current && event.key === storyReadKey(viewer.current))
        setSeen(readStories(viewer.current));
    };
    window.addEventListener("storage", syncRead);
    window.addEventListener("focus", refresh);
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
      window.removeEventListener("vq-community-changed", refresh);
      auth.data.subscription.unsubscribe();
    };
  }, []);
  const unread = unreadStories(members, seen);
  // The viewer opens on tap; a post is read only once the viewer has displayed it.
  const [open, setOpen] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const saveRead = useCallback((next: string[]) => {
    if (!viewer.current) return;
    const merged = [...new Set([...readStories(viewer.current), ...next])].slice(-2000);
    setSeen(merged);
    try {
      localStorage.setItem(storyReadKey(viewer.current), JSON.stringify(merged));
    } catch {
      /* Keep this visit responsive if storage is disabled. */
    }
  }, []);
  // Browser Forward can land on a closed viewer's old #story entry: tidy it away (replace, not a
  // new entry) so the URL matches what is on screen and the next open adds a fresh entry.
  useEffect(() => {
    const tidy = () => {
      if (!open && window.location.hash === "#story")
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    };
    tidy();
    window.addEventListener("popstate", tidy);
    return () => window.removeEventListener("popstate", tidy);
  }, [open]);
  const closeViewer = useCallback(() => {
    setOpen(null);
    // Return focus to the ring that opened the viewer, or the rail if that ring is now read.
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(".community-stories button, .community-stories a");
      target?.focus();
    });
  }, []);
  return (
    <div className="community-story-wrap" data-no-tab-swipe>
      <span className="story-divider" aria-hidden="true">
        |
      </span>
      <div className="community-stories" aria-label="Recent community posts">
        {unread.map((member) => (
          <button
            type="button"
            className="community-story"
            key={member.post_id}
            onClick={(e) => {
              opener.current = e.currentTarget;
              setOpen(member.post_id);
            }}
            aria-haspopup="dialog"
            aria-label={`Open ${member.username}'s recent community posts`}
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
        {!unread.length ? (
          <Link className="story-empty" href="/community">
            {failed
              ? "Open Community →"
              : members.length
                ? "All caught up · Community →"
                : "Start a conversation →"}
          </Link>
        ) : null}
      </div>
      {/* Rendered on <body>, outside the sport strip and its link styles. */}
      {open
        ? createPortal(
            <StoryViewer startPostId={open} onClose={closeViewer} onRead={saveRead} />,
            document.body,
          )
        : null}
    </div>
  );
}
