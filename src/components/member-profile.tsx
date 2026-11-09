"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Grid3x3,
  Heart,
  Instagram,
  MessageCircle,
  Rows3,
  Settings,
  Twitter,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Shell } from "./ui";
import CommunityPhoto from "./community-photo";
import ProfileEditor from "./profile-editor";
import { ago } from "@/lib/zone-feed";
import {
  cardLabel,
  compactCount,
  isProfile,
  memberSince,
  socialHandle,
  stateName,
  type MemberProfileData,
} from "@/lib/member-profile";
import "@/app/member-profile.css";

/**
 * A member's profile, Instagram / X style: avatar, username, follower and following counts, follow
 * button, then their posts (as a feed, or a photo grid). The launch-era challenge timeline is gone.
 */
export default function MemberProfile({ username }: { username: string }) {
  const [profile, setProfile] = useState<MemberProfileData | null>(null),
    [loading, setLoading] = useState(true),
    [uid, setUid] = useState<string | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"posts" | "media">("posts"),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const run = ++generation.current;
    const { data } = await supabase.auth.getSession();
    if (run !== generation.current) return;
    const id = data.session?.user.id ?? null;
    setUid(id);
    if (!id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const r = await supabase.rpc("community_profile", { p_username: username });
    if (run !== generation.current) return;
    setProfile(!r.error && isProfile(r.data) ? r.data : null);
    setError(
      r.error ? "Could not load this profile. Refresh to try again." : "",
    );
    setLoading(false);
  }, [username]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const sub = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    return () => {
      generation.current++;
      clearInterval(timer);
      sub.data.subscription.unsubscribe();
    };
  }, [load]);

  async function toggleFollow() {
    if (!uid || !profile || profile.is_me || busy) return;
    const was = profile.i_follow,
      target = username;
    setBusy(true);
    setProfile({
      ...profile,
      i_follow: !was,
      followers: profile.followers + (was ? -1 : 1),
    });
    const r = was
      ? await supabase
          .from("member_follows")
          .delete()
          .eq("user_id", uid)
          .eq("target_user_id", profile.user_id)
      : await supabase
          .from("member_follows")
          .insert({ user_id: uid, target_user_id: profile.user_id });
    setBusy(false);
    if (target !== username) return;
    if (r.error) {
      // Refetch instead of reversing the optimistic change: a refresh may already have replaced it.
      await load();
      if (target === username) setError("Follow could not save. Please retry.");
    } else setError("");
  }

  const media = profile?.posts.filter((p) => p.photo_path) ?? [];
  return (
    <Shell active="community">
      <div className="vq-profile">
        <Link className="vq-profile-back" href="/community">
          ← The Zone
        </Link>
        {loading ? (
          <div className="vq-profile-skeleton" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        ) : !uid ? (
          <section className="vq-profile-gate">
            <h1>Member profiles</h1>
            <p>Profiles are visible to signed-in members.</p>
            <Link href="/membership" className="vq-profile-follow">
              Sign in
            </Link>
          </section>
        ) : !profile ? (
          <section className="vq-profile-gate">
            <h1>Profile unavailable</h1>
            <p>
              {error ||
                "This profile is private, has changed its username, or isn't part of The Zone."}
            </p>
          </section>
        ) : (
          <>
            <header className="vq-profile-head">
              <div className="vq-profile-cover" aria-hidden="true">
                <span>VQ</span>
              </div>
              <div className="vq-profile-identity">
                <div className="vq-profile-avatar">
                  {profile.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar}
                      alt={`${profile.username} profile photo`}
                    />
                  ) : (
                    <span aria-hidden="true">
                      {profile.username.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="vq-profile-actions">
                  {profile.is_me ? (
                    <button
                      type="button"
                      className="vq-profile-edit"
                      onClick={() => setEditing(true)}
                    >
                      <Settings size={16} aria-hidden="true" /> Edit profile
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`vq-profile-follow ${profile.i_follow ? "is-following" : ""}`}
                      aria-pressed={profile.i_follow}
                      disabled={busy}
                      onClick={() => void toggleFollow()}
                    >
                      {profile.i_follow ? "Following" : "Follow"}
                    </button>
                  )}
                </div>
              </div>
              <h1 className="vq-profile-name">{profile.username}</h1>
              {profile.tagline ? (
                <p className="vq-profile-tagline">{profile.tagline}</p>
              ) : null}
              <p className="vq-profile-handle">
                @{profile.username}
                {stateName(profile.state) ? (
                  <span> · {stateName(profile.state)}</span>
                ) : null}
              </p>
              {memberSince(profile.member_since) ? (
                <p className="vq-profile-since">
                  {memberSince(profile.member_since)}
                </p>
              ) : null}
              {profile.bio ? (
                <p className="vq-profile-bio">{profile.bio}</p>
              ) : null}
              <dl className="vq-profile-stats">
                <div>
                  <dt>Posts</dt>
                  <dd>{compactCount(profile.post_count)}</dd>
                </div>
                <div>
                  <dt>Followers</dt>
                  <dd>{compactCount(profile.followers)}</dd>
                </div>
                <div>
                  <dt>Following</dt>
                  <dd>{compactCount(profile.following)}</dd>
                </div>
              </dl>
              {socialHandle(profile.instagram_url, "instagram") ||
              socialHandle(profile.x_url, "x") ? (
                <div className="vq-profile-socials">
                  {socialHandle(profile.instagram_url, "instagram") ? (
                    <a
                      className="vq-profile-social"
                      href={profile.instagram_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${profile.username} on Instagram (opens in a new tab)`}
                    >
                      <Instagram size={17} aria-hidden="true" />
                      <span>
                        {socialHandle(profile.instagram_url, "instagram")}
                      </span>
                    </a>
                  ) : null}
                  {socialHandle(profile.x_url, "x") ? (
                    <a
                      className="vq-profile-social"
                      href={profile.x_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${profile.username} on X (opens in a new tab)`}
                    >
                      <Twitter size={17} aria-hidden="true" />
                      <span>{socialHandle(profile.x_url, "x")}</span>
                    </a>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p className="vq-profile-error" role="status">
                  {error}
                </p>
              ) : null}
            </header>
            {editing && profile.is_me && uid ? (
              <ProfileEditor
                profile={profile}
                uid={uid}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  void load();
                }}
              />
            ) : null}

            <nav className="vq-profile-tabs" aria-label="Profile sections">
              <button
                type="button"
                aria-pressed={tab === "posts"}
                onClick={() => setTab("posts")}
              >
                <Rows3 size={16} aria-hidden="true" /> Posts
              </button>
              <button
                type="button"
                aria-pressed={tab === "media"}
                onClick={() => setTab("media")}
              >
                <Grid3x3 size={16} aria-hidden="true" /> Media
              </button>
            </nav>

            {tab === "posts" ? (
              profile.posts.length ? (
                <ol className="vq-profile-posts">
                  {profile.posts.map((p) => (
                    <li key={p.id} className="vq-profile-post">
                      <div className="vq-profile-post-meta">
                        <span className="vq-profile-sport">
                          {p.sport.toUpperCase()}
                        </span>
                        {cardLabel(p.card) ? (
                          <span className="vq-profile-card">
                            {cardLabel(p.card)}
                          </span>
                        ) : null}
                        <time dateTime={p.created_at}>{ago(p.created_at)}</time>
                      </div>
                      <p className="vq-profile-body">{p.body}</p>
                      {p.photo_path ? (
                        <div className="vq-profile-photo">
                          <CommunityPhoto path={p.photo_path} title={p.title} />
                        </div>
                      ) : null}
                      <div className="vq-profile-post-foot">
                        <span>
                          <Heart size={15} aria-hidden="true" /> {p.reactions}
                        </span>
                        <span>
                          <MessageCircle size={15} aria-hidden="true" />{" "}
                          {p.comments}
                        </span>
                        <Link href={`/community?post=${p.id}`}>
                          Open in The Zone →
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="vq-profile-empty">
                  <h2>No posts yet</h2>
                  <p>
                    {profile.is_me
                      ? "Share your first take in The Zone."
                      : `When ${profile.username} posts, it shows up here.`}
                  </p>
                  {profile.is_me ? (
                    <Link className="vq-profile-follow" href="/community">
                      Post in The Zone
                    </Link>
                  ) : null}
                </div>
              )
            ) : media.length ? (
              <ul className="vq-profile-grid">
                {media.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/community?post=${p.id}`}
                      aria-label={`Open ${p.title} in The Zone`}
                    >
                      <CommunityPhoto
                        path={p.photo_path!}
                        title={p.title}
                        openable={false}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="vq-profile-empty">
                <h2>No photos yet</h2>
                <p>Photo posts show up here as a grid.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
