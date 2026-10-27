"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { type CommunityProfile, type CommunityMember } from "@/lib/community";
import CommunityCard from "./community-run-card";
const blank: CommunityProfile = {
  username: "",
  region: "",
  avatar: null,
  visible: false,
};
export function Avatar({
  profile,
}: {
  profile: Pick<CommunityProfile, "username" | "avatar">;
}) {
  return profile.avatar ? (
    <img
      className="community-avatar"
      src={profile.avatar}
      alt={`${profile.username} avatar`}
      width={56}
      height={56}
    />
  ) : (
    <span className="community-avatar initials" aria-hidden="true">
      {profile.username.slice(0, 2).toUpperCase() || "VQ"}
    </span>
  );
}
export function SocialLinks({
  profile,
}: {
  profile: Pick<CommunityProfile, "instagram_url" | "x_url">;
}) {
  return (
    <div className="profile-socials">
      {profile.instagram_url && (
        <a
          href={profile.instagram_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Instagram ↗
        </a>
      )}
      {profile.x_url && (
        <a href={profile.x_url} target="_blank" rel="noopener noreferrer">
          X ↗
        </a>
      )}
    </div>
  );
}
export default function CommunityHome({
  challengeId,
  number,
  children,
}: {
  challengeId: string;
  number: number;
  children: ReactNode;
}) {
  const [uid, setUid] = useState<string | null>(null),
    [profile, setProfile] = useState<CommunityProfile>(blank),
    [members, setMembers] = useState<CommunityMember[]>([]),
    [notice, setNotice] = useState(""),
    [expanded, setExpanded] = useState(false),
    [ready, setReady] = useState(false),
    [admin, setAdmin] = useState(false);
  const epoch = useRef(0);
  const load = useCallback(async () => {
    const version = ++epoch.current;
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user.id;
    if (!user) {
      if (version === epoch.current) {
        setUid(null);
        setProfile(blank);
        setMembers([]);
        setReady(true);
      }
      return;
    }
    const [p, r, access] = await Promise.all([
      supabase
        .from("community_profiles")
        .select("username,region,avatar,visible,instagram_url,x_url")
        .eq("user_id", user)
        .maybeSingle(),
      supabase.rpc("community_roster", { p_challenge_id: challengeId }),
      supabase.rpc("membership_status"),
    ]);
    if (version !== epoch.current) return;
    setUid(user);
    setAdmin(access.data?.admin === true);
    setReady(true);
    if (p.error || r.error) {
      setNotice(
        "Community unavailable right now. Your challenge is still below.",
      );
      return;
    }
    setNotice("");
    setProfile(p.data || blank);
    setMembers(r.data || []);
  }, [challengeId]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    window.addEventListener("focus", load);
    window.addEventListener("vq-community-changed", load);
    const auth = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0);
    });
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("vq-community-changed", load);
      auth.data.subscription.unsubscribe();
    };
  }, [load]);
  const recent = [...members]
    .sort(
      (a, b) =>
        new Date(b.last_checkin || b.joined_at).getTime() -
        new Date(a.last_checkin || a.joined_at).getTime(),
    )
    .slice(0, 5);
  return (
    <section className="community-home community-resume">
      {/* Members with a profile reach it from the photo in the top bar, so Home stays about the games. */}
      {!(uid && profile.username) && (
        <aside
          className="community-profile-rail"
          aria-label="Your community profile"
        >
          <div className="profile-cover">
            <span>VQ / COMMUNITY</span>
          </div>
          <div className="profile-rail-content">
            <Avatar profile={profile} />
            <span className="eyebrow">VEGAS QUANT COMMUNITY</span>
            <h1>
              {profile.username || (uid ? "Your profile" : "Find your people.")}
            </h1>
            {profile.username && (
              <span className="profile-handle">@{profile.username}</span>
            )}
            <p>{profile.region || "Research together. Follow at your pace."}</p>
            <SocialLinks profile={profile} />
            {uid ? (
              profile.username ? (
                <Link
                  className="profile-view-link"
                  href={`/community/${encodeURIComponent(profile.username)}`}
                >
                  My activity →
                </Link>
              ) : (
                <Link
                  className="profile-view-link"
                  href="/membership#community-settings"
                >
                  Set up your identity in Account →
                </Link>
              )
            ) : (
              <Link className="primary" href="/membership">
                Join the community →
              </Link>
            )}
            <div className="profile-rail-note">
              <span className="eyebrow">THE 5-SPOT CHALLENGE</span>
              <p>
                Five qualifying stages.
                <br />
                Your own pace.
              </p>
            </div>
          </div>
        </aside>
      )}
      <details className="profile-roster community-directory community-drawer">
        <summary>
          <span>
            Community{" "}
            <span className="community-count">
              {members.length === 100 ? "100+" : members.length}
            </span>
          </span>
          <span className="community-directory-action">
            View members <span aria-hidden="true">⌄</span>
          </span>
        </summary>
        <section className="community-panel">
          {admin && (
            <Link className="text-link" href="/admin/accounts">
              Admin: all registered accounts →
            </Link>
          )}
          <div className="community-panel-head">
            <div>
              <span className="eyebrow">ALL MEMBERS</span>
              <h2>Your Vegas Quant community</h2>
            </div>
            <span className="community-count">
              {members.length === 100 ? "100+" : members.length}
            </span>
          </div>
          <p>
            Everyone is here, whether they tail or not. Private profiles appear
            under a generic member name. This directory does not show live
            online status.
          </p>
          {!ready ? (
            <p>Loading community…</p>
          ) : !uid ? (
            <p>
              Sign in to meet the community. Members can hide their profiles in
              Account settings.
            </p>
          ) : members.length === 0 ? (
            <p>
              Registered members appear here without joining or tailing a
              challenge.
            </p>
          ) : (
            <div className={`community-roster ${expanded ? "expanded" : ""}`}>
              {(expanded
                ? [...members].sort(
                    (a, b) => Number(b.visible) - Number(a.visible),
                  )
                : [...members]
                    .sort((a, b) => Number(b.visible) - Number(a.visible))
                    .slice(0, 8)
              ).map((m) => (
                <Link
                  href={
                    m.visible === false
                      ? "/membership"
                      : `/community/${encodeURIComponent(m.username)}`
                  }
                  className="community-person"
                  key={m.username}
                >
                  <Avatar profile={m} />
                  <div>
                    <strong>@{m.username}</strong>
                    <small>{m.region || "Vegas Quant member"}</small>
                    <span>
                      {m.visible === false
                        ? "Private member"
                        : "Community member"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {members.length > 8 && (
            <button
              className="text-link"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "View community →"}
            </button>
          )}
        </section>
      </details>
      <div className="community-layout">
        <div className="community-main">{children}</div>
        <aside className="community-sidebar" aria-label="Challenge community">
          {uid && (
            <details>
              <summary>
                Your share card <span aria-hidden="true">↗</span>
              </summary>
              <CommunityCard
                profile={profile}
                challengeId={challengeId}
                number={number}
              />
            </details>
          )}
          <details>
            <summary>
              Community activity <span aria-hidden="true">↓</span>
            </summary>
            <section className="community-panel">
              <span className="eyebrow">COMMUNITY ACTIVITY</span>
              <h2>Around the challenge</h2>
              {recent.length ? (
                recent.map((m) => (
                  <div className="community-event" key={m.username}>
                    <Link
                      href={
                        m.visible === false
                          ? "/membership"
                          : `/community/${encodeURIComponent(m.username)}`
                      }
                    >
                      <strong>@{m.username}</strong>
                    </Link>
                    <p>
                      {m.last_checkin
                        ? `Followed ${m.followed} of 5 stages`
                        : "Joined Vegas Quant"}
                    </p>
                    <time>
                      {new Date(
                        m.last_checkin || m.joined_at,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                ))
              ) : (
                <p>
                  Visible members’ joins and stage check-ins will appear here.
                  Following never requires a wager.
                </p>
              )}
            </section>
          </details>
        </aside>
      </div>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
