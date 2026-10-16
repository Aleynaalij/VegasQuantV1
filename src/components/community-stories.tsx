"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  post_id: string;
  username: string;
  avatar: string | null;
  sport: string;
};
/** Recent community posts, not online presence or disappearing stories. */
export default function CommunityStories() {
  const [members, setMembers] = useState<Activity[]>([]);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const version = ++generation.current;
      const session = await supabase.auth.getSession();
      if (!live || version !== generation.current) return;
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
      window.removeEventListener("focus", refresh);
      window.removeEventListener("vq-community-changed", refresh);
      auth.data.subscription.unsubscribe();
    };
  }, []);
  return (
    <div className="community-story-wrap" data-no-tab-swipe>
      <span className="story-divider" aria-hidden="true">
        |
      </span>
      <div className="community-stories" aria-label="Recent community posts">
        {members.map((member) => (
          <Link
            className="community-story"
            key={member.username}
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
        {!members.length ? (
          <Link className="story-empty" href="/community">
            {failed ? "Open Community →" : "Start a conversation →"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
