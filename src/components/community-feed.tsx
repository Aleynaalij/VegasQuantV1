"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Shell } from "./ui";
import { supabase } from "@/lib/supabase";
import CommunityPhoto from "./community-photo";
import { COMMUNITY_PHOTO_BUCKET, MAX_PHOTO_BYTES } from "@/lib/community-photo";
import { time } from "@/lib/domain";
import TailLeaderboard from "./tail-leaderboard";
import SectionBoundary from "./section-boundary";
type Post = {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  body: string;
  sport: string;
  kind: string;
  legs: string[];
  stake: number | null;
  created_at: string;
  reactions: number;
  reacted: boolean;
  comments: number;
  following: boolean;
  photo_path: string | null;
};
type Comment = {
  id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};
const kinds: Record<string, string> = {
  slip: "My slip",
  talk: "Game talk",
  result: "Result",
};
function Comments({
  postId,
  uid,
  admin,
  onChange,
  onBlock,
}: {
  postId: string;
  uid: string;
  admin: boolean;
  onChange: () => void;
  onBlock: (id: string, label: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<Comment[]>([]),
    [body, setBody] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await supabase
      .from("community_post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (r.error) setNotice("Comments could not load. Try again.");
    else setRows(r.data || []);
  }, [postId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await supabase
      .from("community_post_comments")
      .insert({ post_id: postId, user_id: uid, body: body.trim() });
    setBusy(false);
    if (r.error) {
      setNotice(
        "Could not comment. Complete a visible community profile and allow ten seconds between comments.",
      );
      return;
    }
    setBody("");
    setNotice("Comment posted.");
    await load();
    onChange();
  }
  async function remove(id: string) {
    const r = await supabase
      .from("community_post_comments")
      .delete()
      .eq("id", id);
    if (r.error) setNotice("Could not remove comment.");
    else {
      await load();
      onChange();
    }
  }
  return (
    <div className="social-comments">
      <form onSubmit={submit}>
        <label htmlFor={`reply-${postId}`}>Join the conversation</label>
        <textarea
          id={`reply-${postId}`}
          required
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share your reasoning or ask a question."
        />
        <button className="primary" disabled={busy}>
          {busy ? "Posting…" : "Post comment"}
        </button>
      </form>
      <p role="status">{notice}</p>
      {rows.map((c) => (
        <article key={c.id}>
          <strong>@{c.author_name}</strong>
          <small> · {time(c.created_at)}</small>
          <p>{c.body}</p>
          {uid !== c.user_id ? (
            <button
              className="text-link"
              onClick={() => void onBlock(c.user_id, c.author_name)}
            >
              Block member
            </button>
          ) : null}
          {(uid === c.user_id || admin) && (
            <button className="text-link" onClick={() => void remove(c.id)}>
              Remove comment
            </button>
          )}
        </article>
      ))}
      {rows.length === 50 ? (
        <small>Showing the latest 50 comments.</small>
      ) : null}
    </div>
  );
}
export default function CommunityFeed() {
  const [uid, setUid] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false),
    [sport, setSport] = useState<"nfl" | "nba">("nfl"),
    [followingOnly, setFollowingOnly] = useState(false),
    [limit, setLimit] = useState(20),
    [rows, setRows] = useState<Post[]>([]),
    [blocked, setBlocked] = useState<
      { target_user_id: string; label: string }[]
    >([]),
    [kind, setKind] = useState("talk"),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [legs, setLegs] = useState(""),
    [stake, setStake] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [openComments, setOpenComments] = useState<string | null>(null),
    [admin, setAdmin] = useState(false),
    [reports, setReports] = useState<
      { id: string; post_id: string; reason: string }[]
    >([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const mutationEpoch = useRef(0);
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const epoch = useRef(0);
  const sessionUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("sport") === "nba")
      setSport("nba");
    let live = true;
    const update = (id: string | null) => {
      if (!live || sessionUid.current === id) return;
      sessionUid.current = id;
      epoch.current++;
      mutationEpoch.current++;
      if (photoInput.current) photoInput.current.value = "";
      setPhoto(null);
      setTitle("");
      setBody("");
      setLegs("");
      setStake("");
      setBusy(false);
      setUid(id);
      setRows([]);
      setOpenComments(null);
      setAdmin(false);
      setReports([]);
      setBlocked([]);
      setLoading(false);
      setAuthReady(true);
    };
    void supabase.auth.getSession().then((s) => {
      if (sessionUid.current === undefined)
        update(s.data.session?.user.id || null);
    });
    const a = supabase.auth.onAuthStateChange((_e, s) =>
      update(s?.user.id || null),
    );
    return () => {
      live = false;
      mutationEpoch.current++;
      epoch.current++;
      a.data.subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!uid) return;
    const n = ++epoch.current;
    setLoading(true);
    const [r, a] = await Promise.all([
      supabase.rpc("community_feed", {
        p_sport: sport,
        p_limit: limit,
        p_following: followingOnly,
      }),
      supabase.rpc("is_admin"),
    ]);
    if (n !== epoch.current) return;
    setLoading(false);
    setAdmin(a.data === true);
    if (r.error) {
      setNotice(
        "Community could not refresh. Your existing posts are preserved.",
      );
      return;
    }
    setRows(r.data || []);
    const blocks = await supabase
      .from("member_blocks")
      .select("target_user_id,label")
      .eq("user_id", uid);
    if (n === epoch.current) setBlocked(blocks.data || []);
    if (a.data === true) {
      const flags = await supabase
        .from("community_reports")
        .select("id,post_id,reason")
        .order("created_at", { ascending: false })
        .limit(50);
      if (n === epoch.current) setReports(flags.data || []);
    }
  }, [uid, sport, limit, followingOnly]);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 60000);
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function post(e: FormEvent) {
    e.preventDefault();
    if (!uid) return;
    const selections = legs
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selections.length > 12 || selections.some((s) => s.length > 180)) {
      setNotice("Use up to twelve selections, each under 180 characters.");
      return;
    }
    if (busy) return;
    const generation = mutationEpoch.current;
    const postId = crypto.randomUUID();
    let uploaded: string | null = null;
    setBusy(true);
    setNotice("");
    try {
      if (photo) {
        const session = await supabase.auth.getSession();
        if (generation !== mutationEpoch.current) return;
        if (session.data.session?.user.id !== uid)
          throw Error("Sign in again before posting.");
        const form = new FormData();
        form.set("photo", photo);
        const response = await fetch(`/api/community/photo?post=${postId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.data.session.access_token}`,
          },
          body: form,
        });
        const data = await response.json();
        if (!response.ok || !data.path)
          throw Error(data.error || "Photo upload failed.");
        uploaded = data.path;
      }
      if (generation !== mutationEpoch.current) return;
      const r = await supabase.from("community_posts").insert({
        id: postId,
        user_id: uid,
        sport,
        kind,
        title: title.trim(),
        body: body.trim(),
        legs: kind === "talk" ? [] : selections,
        stake: kind === "talk" || stake === "" ? null : Number(stake),
        photo_path: uploaded,
      });
      if (r.error) {
        if (uploaded)
          await supabase.storage
            .from(COMMUNITY_PHOTO_BUCKET)
            .remove([uploaded]);
        throw Error(
          "Could not publish. Complete your visible profile and allow thirty seconds between posts. Your draft is kept; retry.",
        );
      }
      if (generation !== mutationEpoch.current) return;
      setTitle("");
      setBody("");
      setLegs("");
      setStake("");
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setNotice("Posted to Community. This does not record a wager.");
      await refresh();
    } catch (error) {
      if (generation === mutationEpoch.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not publish. Your draft is kept; retry.",
        );
    } finally {
      if (generation === mutationEpoch.current) setBusy(false);
    }
  }
  async function react(p: Post) {
    if (!uid || busy) return;
    setBusy(true);
    const r = p.reacted
      ? await supabase
          .from("community_reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", uid)
      : await supabase
          .from("community_reactions")
          .insert({ post_id: p.id, user_id: uid });
    setBusy(false);
    if (r.error) setNotice("Reaction could not save.");
    else await refresh();
  }
  async function follow(p: Post) {
    if (!uid || busy) return;
    setBusy(true);
    const r = p.following
      ? await supabase
          .from("member_follows")
          .delete()
          .eq("user_id", uid)
          .eq("target_user_id", p.user_id)
      : await supabase
          .from("member_follows")
          .insert({ user_id: uid, target_user_id: p.user_id });
    setBusy(false);
    if (r.error) setNotice("Follow could not save.");
    else await refresh();
  }
  async function block(id: string, label: string) {
    if (!uid || busy) return;
    setBusy(true);
    const r = await supabase
      .from("member_blocks")
      .insert({ user_id: uid, target_user_id: id, label });
    setBusy(false);
    setNotice(
      r.error
        ? "Could not block this member."
        : "Member blocked. Their posts and comments are hidden from your community feed.",
    );
    if (!r.error) {
      setOpenComments(null);
      await refresh();
    }
  }
  async function unblock(id: string) {
    if (!uid || busy) return;
    setBusy(true);
    const r = await supabase
      .from("member_blocks")
      .delete()
      .eq("user_id", uid)
      .eq("target_user_id", id);
    setBusy(false);
    setNotice(r.error ? "Could not unblock member." : "Member unblocked.");
    if (!r.error) await refresh();
  }
  async function restrict(id: string, restricted: boolean) {
    if (!admin || busy) return;
    setBusy(true);
    const r = await supabase.rpc("restrict_community_member", {
      p_user: id,
      p_reason: "Moderator action following community review",
      p_restricted: restricted,
    });
    setBusy(false);
    setNotice(
      r.error
        ? "Could not change posting access."
        : restricted
          ? "Member posting restricted."
          : "Member posting restored.",
    );
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const generation = mutationEpoch.current;
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session || session.data.session.user.id !== uid)
        throw Error("Sign in again.");
      const r = await fetch(`/api/community/posts/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not remove post.");
      if (generation !== mutationEpoch.current) return;
      setNotice("Post and attached photo removed.");
      await refresh();
    } catch (error) {
      if (generation === mutationEpoch.current)
        setNotice(
          error instanceof Error ? error.message : "Could not remove post.",
        );
    } finally {
      if (generation === mutationEpoch.current) setBusy(false);
    }
  }
  async function report(e: FormEvent<HTMLFormElement>, postId: string) {
    e.preventDefault();
    if (!uid) return;
    const form = e.currentTarget;
    const reason = String(new FormData(form).get("reason") || "").trim();
    const r = await supabase
      .from("community_reports")
      .insert({ post_id: postId, user_id: uid, reason });
    setNotice(
      r.error
        ? "Report could not save, or you already reported this post."
        : "Report submitted for admin review.",
    );
    if (!r.error) form.reset();
  }
  return (
    <Shell active="community" sport={sport}>
      <div className="community-feed">
        <header>
          <span className="eyebrow">YOUR PEOPLE · YOUR PERSPECTIVE</span>
          <p>
            Keep it respectful. No threats, scams or guaranteed-return claims.
            Reporting and blocking are available on member posts.
          </p>
          {blocked.length ? (
            <details>
              <summary>Blocked members · {blocked.length}</summary>
              {blocked.map((b) => (
                <p key={b.target_user_id}>
                  @{b.label}{" "}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void unblock(b.target_user_id)}
                  >
                    Unblock
                  </button>
                </p>
              ))}
            </details>
          ) : null}
          <h1>Community</h1>
          <p>Share a slip. Talk through a game. Explain your thinking.</p>
          <p className="notice">
            Member picks are community opinions, separate from Vegas Quant
            selections. Sharing, reacting or following never records a wager.
            Results are member-reported, not verified records.
          </p>
        </header>
        <nav className="zone-views" aria-label="Community sport">
          {(["nfl", "nba"] as const).map((s) => (
            <button
              className={sport === s ? "primary" : "secondary"}
              aria-pressed={sport === s}
              key={s}
              onClick={() => {
                setSport(s);
                setKind("talk");
                setLimit(20);
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </nav>
        {sport === "nba" ? (
          <p className="notice">
            NBA preparation mode: game discussion is open. NBA pregame slips and
            result posts stay disabled until the owner opens publishing after
            the season begins.
          </p>
        ) : null}
        <Link href="/feed">
          Looking for analyst picks and injury updates? Head to The Zone →
        </Link>
        <SectionBoundary name="Tail leaderboard">
          <TailLeaderboard />
        </SectionBoundary>
        {!authReady ? (
          <p>Checking your session…</p>
        ) : !uid ? (
          <section className="community-composer">
            <h2>Join the conversation</h2>
            <p>
              A free account lets you read member posts. Complete your visible
              profile to publish and comment.
            </p>
            <Link className="primary" href="/membership">
              Sign in or create an account
            </Link>
          </section>
        ) : (
          <>
            <form className="community-composer" onSubmit={post}>
              <h2>Start a conversation</h2>
              <fieldset disabled={busy}>
                <p>
                  Your profile username is published with your post. Avoid
                  account numbers and private ticket details. Sharing your stake
                  is optional.
                </p>
                <label>
                  Post type
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    {Object.entries(kinds).map(([v, label]) => (
                      <option
                        key={v}
                        value={v}
                        disabled={sport === "nba" && v !== "talk"}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Headline
                  <input
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are you watching tonight?"
                  />
                </label>
                <label>
                  Caption or reasoning
                  <textarea
                    required
                    maxLength={2000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Why you like it—and what could go wrong."
                  />
                </label>
                <label>
                  Add a photo · optional
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setPhoto(null);
                        return;
                      }
                      if (
                        file.size > MAX_PHOTO_BYTES ||
                        !["image/jpeg", "image/png", "image/webp"].includes(
                          file.type,
                        )
                      ) {
                        setNotice("Choose a JPG, PNG or WebP under 5 MB.");
                        e.target.value = "";
                        setPhoto(null);
                        return;
                      }
                      setPhoto(file);
                      setNotice("");
                    }}
                  />
                </label>
                <small>
                  Cover account numbers, balances, barcodes and private ticket
                  details before sharing. Photo metadata is removed during
                  upload. Members can still screenshot shared photos.
                </small>
                {preview ? (
                  <div className="community-photo-preview">
                    <img src={preview} alt="Photo preview before publishing" />
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setPhoto(null);
                        if (photoInput.current) photoInput.current.value = "";
                      }}
                    >
                      Remove photo
                    </button>
                  </div>
                ) : null}
                {kind !== "talk" ? (
                  <>
                    <label>
                      Selections · one per line
                      <textarea
                        required={kind === "slip" && !photo}
                        maxLength={2160}
                        value={legs}
                        onChange={(e) => setLegs(e.target.value)}
                        placeholder="Player · market · target"
                      />
                    </label>
                    <label>
                      Stake to share · optional
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="0.01"
                        value={stake}
                        onChange={(e) => setStake(e.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                <button
                  className="primary"
                  disabled={busy || (sport === "nba" && kind !== "talk")}
                >
                  {busy ? "Publishing…" : "Post to Community"}
                </button>
              </fieldset>
              <Link href="/membership">
                Complete or manage your community profile →
              </Link>
            </form>
            <div className="social-actions">
              <button
                className={followingOnly ? "secondary" : "primary"}
                aria-pressed={!followingOnly}
                onClick={() => {
                  setFollowingOnly(false);
                  setLimit(20);
                }}
              >
                Everyone
              </button>
              <button
                className={followingOnly ? "primary" : "secondary"}
                aria-pressed={followingOnly}
                onClick={() => {
                  setFollowingOnly(true);
                  setLimit(20);
                }}
              >
                Following
              </button>
              <button
                className="secondary"
                disabled={loading}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>
            <p role="status">{notice}</p>
            {loading ? <p>Refreshing Community…</p> : null}
            {!loading && rows.length === 0 ? (
              <section className="community-composer">
                <h2>
                  {followingOnly
                    ? "Follow someone to build your feed."
                    : "Be the first to start the conversation."}
                </h2>
                <p>
                  Which player benefits most from the latest injury news? Bring
                  a source and your perspective.
                </p>
              </section>
            ) : null}
            {rows.map((p) => (
              <article className="social-post" key={p.id}>
                <header>
                  <Link
                    href={`/community/${encodeURIComponent(p.author_name)}`}
                  >
                    @{p.author_name}
                  </Link>
                  <small>{time(p.created_at)}</small>
                  {p.user_id !== uid ? (
                    <button
                      className="secondary"
                      disabled={busy}
                      aria-pressed={p.following}
                      onClick={() => void follow(p)}
                    >
                      {p.following ? "Following" : "Follow"}
                    </button>
                  ) : null}
                </header>
                <span className="member-label">
                  MEMBER POST · {kinds[p.kind]}
                  {p.kind === "result" ? " · UNVERIFIED RESULT" : ""}
                </span>
                <h2>{p.title}</h2>
                <p>{p.body}</p>
                {p.photo_path ? (
                  <CommunityPhoto
                    key={`${uid}:${p.id}`}
                    path={p.photo_path}
                    title={p.title}
                  />
                ) : null}
                {p.legs.length ? (
                  <ol>
                    {p.legs.map((leg, i) => (
                      <li key={i}>{leg}</li>
                    ))}
                  </ol>
                ) : null}
                {p.stake !== null ? (
                  <small>
                    Member-shared stake: ${Number(p.stake).toFixed(2)}
                  </small>
                ) : null}
                <div className="social-actions">
                  {uid !== p.user_id ? (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void block(p.user_id, p.author_name)}
                    >
                      Block member
                    </button>
                  ) : null}
                  {admin && uid !== p.user_id ? (
                    <>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void restrict(p.user_id, true)}
                      >
                        Restrict posting
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void restrict(p.user_id, false)}
                      >
                        Restore posting
                      </button>
                    </>
                  ) : null}
                  <button
                    className="secondary"
                    disabled={busy}
                    aria-pressed={p.reacted}
                    onClick={() => void react(p)}
                  >
                    Helpful · {p.reactions}
                  </button>
                  <button
                    className="secondary"
                    aria-expanded={openComments === p.id}
                    onClick={() =>
                      setOpenComments(openComments === p.id ? null : p.id)
                    }
                  >
                    Comments · {p.comments}
                  </button>
                  {uid === p.user_id || admin ? (
                    <button
                      className="text-link"
                      onClick={() => void remove(p.id)}
                    >
                      {admin && uid !== p.user_id
                        ? "Moderate · Remove post"
                        : "Remove my post"}
                    </button>
                  ) : null}
                </div>
                <details>
                  <summary>Report this post</summary>
                  <form onSubmit={(e) => void report(e, p.id)}>
                    <label>
                      Reason
                      <textarea name="reason" required maxLength={500} />
                    </label>
                    <button className="secondary">Submit report</button>
                  </form>
                </details>
                {openComments === p.id ? (
                  <Comments
                    key={`${uid}:${p.id}`}
                    onBlock={block}
                    postId={p.id}
                    uid={uid}
                    admin={admin}
                    onChange={() => void refresh()}
                  />
                ) : null}
              </article>
            ))}
            {rows.length === limit && limit < 100 ? (
              <button
                className="secondary"
                onClick={() => setLimit((n) => n + 20)}
              >
                Load more posts
              </button>
            ) : null}
            {admin && reports.length ? (
              <section className="community-composer">
                <h2>Moderation · Latest reports</h2>
                {reports.map((r) => (
                  <div key={r.id}>
                    <p>{r.reason}</p>
                    <button
                      className="secondary"
                      onClick={() => void remove(r.post_id)}
                    >
                      Remove reported post
                    </button>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </Shell>
  );
}
