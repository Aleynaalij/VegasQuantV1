"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Shell } from "./ui";
import { Avatar, SocialLinks } from "./community-home";
import type { CommunityProfile } from "@/lib/community";
type Member = CommunityProfile & {
  events: {
    kind: "joined" | "followed";
    challenge_number: number;
    stage_number: number | null;
    at: string;
  }[];
};
export default function MemberProfile({ username }: { username: string }) {
  const [profile, setProfile] = useState<Member | null>(null),
    [loading, setLoading] = useState(true),
    [signedIn, setSignedIn] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSignedIn(!!data.session);
      if (!data.session) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const r = await supabase.rpc("community_member", {
        p_username: username,
      });
      if (!alive) return;
      setProfile(r.error ? null : r.data);
      setError(
        r.error ? "Could not load this profile. Refresh to try again." : "",
      );
      setLoading(false);
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    const sub = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    return () => {
      alive = false;
      clearInterval(timer);
      sub.data.subscription.unsubscribe();
    };
  }, [username]);
  return (
    <Shell active="home">
      <Link className="text-link" href="/">
        ← Back to community
      </Link>
      {loading ? (
        <p>Loading member profile…</p>
      ) : !signedIn ? (
        <section className="community-panel">
          <h1>Meet the community</h1>
          <p>Member profiles are visible to signed-in members only.</p>
          <Link href="/membership" className="primary">
            Sign in
          </Link>
        </section>
      ) : !profile ? (
        <section className="community-panel">
          <h1>Profile unavailable</h1>
          <p>
            {error ||
              "This profile is private, has changed its username, or is not part of the community."}
          </p>
        </section>
      ) : (
        <div className="member-profile-layout">
          <aside className="community-profile-rail">
            <div className="profile-cover">
              <span>VQ / COMMUNITY</span>
            </div>
            <div className="profile-rail-content">
              <Avatar profile={profile} />
              <h1>{profile.username}</h1>
              <span className="profile-handle">@{profile.username}</span>
              {profile.region && <p>{profile.region}</p>}
              <SocialLinks profile={profile} />
              <p className="profile-rail-note">
                Research. Decisions. Progress.
              </p>
            </div>
          </aside>
          <section className="member-activity-feed">
            <header>
              <span className="eyebrow">THEIR JOURNEY</span>
              <h2>Activity & milestones</h2>
              <p>
                Shared challenge participation. Check-ins are not bets or
                verified wager wins.
              </p>
            </header>
            {profile.events.length ? (
              profile.events.map((e, i) => (
                <article className="member-feed-card" key={`${e.at}:${i}`}>
                  <span className="member-event-icon" aria-hidden="true">
                    {e.kind === "joined" ? "↗" : "✓"}
                  </span>
                  <div>
                    <span className="eyebrow">
                      CHALLENGE #{e.challenge_number}
                    </span>
                    <h3>
                      {e.kind === "joined"
                        ? "Joined the challenge"
                        : `Followed stage ${e.stage_number}`}
                    </h3>
                    <p>
                      {e.kind === "joined"
                        ? "A new five-stage journey begins."
                        : "Checked in on the decision and followed the research."}
                    </p>
                    <time dateTime={e.at}>
                      {new Date(e.at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </article>
              ))
            ) : (
              <div className="community-panel">
                <h3>The story starts here.</h3>
                <p>Challenge joins and stage check-ins will appear here.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
