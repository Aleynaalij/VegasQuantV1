"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  function markRead(postId: string) {
    if (!viewer.current) return;
    const next = [
      ...new Set([...readStories(viewer.current), ...seen, postId]),
    ].slice(-2000);
    setSeen(next);
    try {
      localStorage.setItem(storyReadKey(viewer.current), JSON.stringify(next));
    } catch {
      /* Keep this visit responsive if storage is disabled. */
    }
  }
  return (
    <div className="community-story-wrap" data-no-tab-swipe>
      <span className="story-divider" aria-hidden="true">
        |
      </span>
      <div className="community-stories" aria-label="Recent community posts">
        {unread.map((member) => (
          <Link
            className="community-story"
            key={member.post_id}
            onClick={() => markRead(member.post_id)}
            href={`/community?sport=${member.sport}&post=${member.post_id}#post-${member.post_id}`}
            aria-label={`Open ${member.username}'s latest community post`}
          >
            <span className="story-ring">
              {member.avatar ? (
                <img src={member.avatar} alt="" width={40} height={40} />
              ) : (
                <span>{member.username.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            <small>{member.username}</small>
          </Link>
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
    </div>
  );
}
