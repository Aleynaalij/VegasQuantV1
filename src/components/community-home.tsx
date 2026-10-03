"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  regions,
  type CommunityProfile,
  type CommunityMember,
} from "@/lib/community";
import CommunityCard from "./community-run-card";
const blank: CommunityProfile = {
  username: "",
  region: "",
  avatar: null,
  visible: false,
};
function Avatar({
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
    [draft, setDraft] = useState<CommunityProfile>(blank),
    [members, setMembers] = useState<CommunityMember[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false),
    [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    epoch = useRef(0);
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
    const [p, r] = await Promise.all([
      supabase
        .from("community_profiles")
        .select("username,region,avatar,visible")
        .eq("user_id", user)
        .maybeSingle(),
      supabase.rpc("community_roster", { p_challenge_id: challengeId }),
    ]);
    if (version !== epoch.current) return;
    setUid(user);
    setReady(true);
    if (p.error || r.error) {
      setNotice(
        "Community unavailable right now. Your challenge is still below.",
      );
      return;
    }
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
  async function photo(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5_000_000
    ) {
      setNotice("Choose a JPG, PNG or WebP under 5 MB.");
      return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const c = canvas.getContext("2d");
      if (!c) throw Error();
      const side = Math.min(img.width, img.height);
      c.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      const avatar = canvas.toDataURL("image/jpeg", 0.8);
      if (avatar.length > 120000) throw Error();
      setDraft((v) => ({ ...v, avatar }));
    } catch {
      setNotice("Could not prepare that photo. Try a smaller image.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!uid || busy) return;
    setBusy(true);
    setNotice("");
    const r = await supabase.from("community_profiles").upsert(
      {
        user_id: uid,
        ...draft,
        username: draft.username.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (r.error)
      setNotice(
        r.error.code === "23505"
          ? "That username is taken. Try another."
          : "Could not save your profile. Try again.",
      );
    else {
      await load();
      dialog.current?.close();
      setNotice("Profile saved. Community visibility is your choice.");
    }
    setBusy(false);
  }
  const recent = [...members]
    .sort(
      (a, b) =>
        new Date(b.last_checkin || b.joined_at).getTime() -
        new Date(a.last_checkin || a.joined_at).getTime(),
    )
    .slice(0, 5);
  return (
    <section className="community-home">
      <header className="community-welcome">
        <div className="community-identity">
          <Avatar profile={profile} />
          <div>
            <span className="eyebrow">VEGAS QUANT COMMUNITY</span>
            <h1>
              {uid
                ? `Welcome${profile.username ? ` back, ${profile.username}` : " to your community"}.`
                : "Your people. Your five-stage run."}
            </h1>
            <p>
              {profile.region ? `${profile.region} · ` : ""}Research together.
              Follow at your pace.
            </p>
          </div>
        </div>
        {uid ? (
          <button
            className="secondary"
            onClick={() => {
              setDraft(profile);
              setNotice("");
              dialog.current?.showModal();
            }}
          >
            {profile.username ? "Edit profile" : "Create my profile"}
          </button>
        ) : (
          <Link className="primary" href="/membership">
            Join the community →
          </Link>
        )}
      </header>
      <div className="community-layout">
        <div className="community-main">{children}</div>
        <aside className="community-sidebar" aria-label="Challenge community">
          <section className="community-panel">
            <div className="community-panel-head">
              <div>
                <span className="eyebrow">CHALLENGE #{number}</span>
                <h2>In this together</h2>
              </div>
              <span className="community-count">
                {members.length === 100 ? "100+" : members.length}
              </span>
            </div>
            <p>
              Members who chose to be visible. Participation, not live online
              status.
            </p>
            {!ready ? (
              <p>Loading community…</p>
            ) : !uid ? (
              <p>
                Sign in to meet the community. Profiles are private until
                members opt in.
              </p>
            ) : members.length === 0 ? (
              <p>
                The roster is just getting started. Create a profile, opt in,
                and join this challenge to appear here.
              </p>
            ) : (
              <div className={`community-roster ${expanded ? "expanded" : ""}`}>
                {(expanded ? members : members.slice(0, 8)).map((m) => (
                  <div className="community-person" key={m.username}>
                    <Avatar profile={m} />
                    <div>
                      <strong>@{m.username}</strong>
                      <small>{m.region || "Region private"}</small>
                      <span>{m.followed}/5 stages followed</span>
                    </div>
                  </div>
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
          {uid && (
            <CommunityCard
              profile={profile}
              challengeId={challengeId}
              number={number}
            />
          )}
          <section className="community-panel">
            <span className="eyebrow">COMMUNITY ACTIVITY</span>
            <h2>Around the challenge</h2>
            {recent.length ? (
              recent.map((m) => (
                <div className="community-event" key={m.username}>
                  <strong>@{m.username}</strong>
                  <p>
                    {m.last_checkin
                      ? `Followed ${m.followed} of 5 stages`
                      : "Joined the challenge"}
                  </p>
                  <time>
                    {new Date(m.last_checkin || m.joined_at).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" },
                    )}
                  </time>
                </div>
              ))
            ) : (
              <p>
                Opted-in joins and stage check-ins will appear here. Following
                never requires a wager.
              </p>
            )}
          </section>
        </aside>
      </div>
      {notice && <p role="status">{notice}</p>}
      <dialog
        ref={dialog}
        className="entry-dialog"
        aria-labelledby="community-profile-title"
      >
        <form className="member-form" onSubmit={save}>
          <h2 id="community-profile-title">Your community identity</h2>
          <Avatar profile={draft} />
          <label>
            Username
            <input
              required
              pattern="[A-Za-z0-9_]{3,24}"
              minLength={3}
              maxLength={24}
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
          </label>
          <small>
            3–24 letters, numbers or underscores. Choose a nickname; no real
            name needed.
          </small>
          <label>
            Region (optional)
            <select
              value={draft.region}
              onChange={(e) => setDraft({ ...draft, region: e.target.value })}
            >
              <option value="">Keep private</option>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Photo (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void photo(e.target.files?.[0])}
            />
          </label>
          {draft.avatar && (
            <button
              type="button"
              className="text-link"
              onClick={() => setDraft({ ...draft, avatar: null })}
            >
              Remove photo
            </button>
          )}
          <label className="entry-confirm">
            <input
              type="checkbox"
              checked={draft.visible}
              onChange={(e) =>
                setDraft({ ...draft, visible: e.target.checked })
              }
            />
            Show my username, photo, region, joins and check-ins to signed-in
            community members.
          </label>
          <small>
            Off by default. Your email, bets, stakes and balance stay private.
            Opting out removes you from the roster and activity. Join a
            challenge separately to participate.
          </small>
          {notice && <p role="alert">{notice}</p>}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
        </form>
      </dialog>
    </section>
  );
}
