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
import CommunityParlayCard from "./community-parlay-card";
import { COMMUNITY_PHOTO_BUCKET, MAX_PHOTO_BYTES } from "@/lib/community-photo";
import { time } from "@/lib/domain";
import { ImagePlus, Heart, MessageCircle } from "lucide-react";
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
    [body, setBody] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [openComments, setOpenComments] = useState<string | null>(null),
    [admin, setAdmin] = useState(false),
    [reports, setReports] = useState<
      { id: string; post_id: string; reason: string }[]
    >([]);
  const [targetPost, setTargetPost] = useState<string | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const scrolledPost = useRef<string | null>(null);
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
    const target = new URLSearchParams(window.location.search).get("post");
    if (target && /^[0-9a-f-]{36}$/i.test(target)) setTargetPost(target);
    let live = true;
    const update = (id: string | null) => {
      if (!live || sessionUid.current === id) return;
      sessionUid.current = id;
      epoch.current++;
      mutationEpoch.current++;
      if (photoInput.current) photoInput.current.value = "";
      setPhoto(null);
      setBody("");
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
    const [r, a, target] = await Promise.all([
      supabase.rpc("community_feed", {
        p_sport: sport,
        p_limit: limit,
        p_following: followingOnly,
      }),
      supabase.rpc("is_admin"),
      targetPost
        ? supabase.rpc("community_post", { p_id: targetPost })
        : Promise.resolve({ data: null, error: null }),
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
    const posts: Post[] = r.data || [];
    if (targetPost && target.error) {
      setNotice("That post could not load. Please refresh to try again.");
      setTargetMissing(false);
    } else {
      setTargetMissing(Boolean(targetPost && !target.data));
    }
    if (target.data && !posts.some((p) => p.id === target.data.id))
      posts.unshift(target.data);
    setRows(posts);
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
  }, [uid, sport, limit, followingOnly, targetPost]);
  useEffect(() => {
    if (
      !targetPost ||
      scrolledPost.current === targetPost ||
      !rows.some((p) => p.id === targetPost)
    )
      return;
    scrolledPost.current = targetPost;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(`post-${targetPost}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [targetPost, rows.length]);
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
    if (!body.trim() && !photo) return;
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
        const data = await response.json().catch(() => null);
        if (!data)
          throw Error(
            response.status === 413
              ? "Photo is too large to upload. Choose a smaller image."
              : "Photo upload could not complete. Please retry.",
          );
        if (!response.ok || !data.path)
          throw Error(data.error || "Photo upload failed.");
        uploaded = data.path;
      }
      if (generation !== mutationEpoch.current) return;
      const r = await supabase.from("community_posts").insert({
        id: postId,
        user_id: uid,
        sport,
        kind: "talk",
        title: "Community post",
        body: body.trim() || "Shared a photo",
        legs: [],
        stake: null,
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
      setBody("");
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setNotice("Posted to Community. This does not record a wager.");
      window.dispatchEvent(new Event("vq-community-changed"));
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
      window.dispatchEvent(new Event("vq-community-changed"));
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
        <header className="community-feed-heading">
          <h1>Community</h1>
          <Link href="/feed">The Zone →</Link>
        </header>
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
              <fieldset disabled={busy}>
                <label className="sr-only" htmlFor="community-message">
                  Your post
                </label>
                <textarea
                  id="community-message"
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={3}
                />
                <div className="composer-toolbar">
                  <label className="attach-photo" title="Attach a photo">
                    <ImagePlus size={22} aria-hidden="true" />{" "}
                    <span>Photo</span>
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
                  <button
                    className="primary"
                    disabled={busy || (!body.trim() && !photo)}
                  >
                    {busy ? "Posting…" : "Post"}
                  </button>
                </div>
                {notice && (
                  <p role="status" className="notice">
                    {notice}
                  </p>
                )}
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
              </fieldset>
              <Link href="/membership">Your profile →</Link>
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
            {targetMissing ? (
              <p role="status">This post is no longer available.</p>
            ) : null}
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
              <article
                className={`social-post ${p.id === targetPost ? "linked-post" : ""}`}
                id={`post-${p.id}`}
                key={p.id}
              >
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
                {p.title !== "Community post" ? <h2>{p.title}</h2> : null}
                <p>{p.body}</p>
                {p.photo_path ? (
                  <CommunityPhoto
                    key={`${uid}:${p.id}`}
                    path={p.photo_path}
                    title={p.title}
                  />
                ) : null}
                {p.kind === "slip" && p.legs.length ? (
                  <CommunityParlayCard
                    title={p.title}
                    legs={p.legs}
                    author={p.author_name}
                    publishedAt={p.created_at}
                  />
                ) : p.legs.length ? (
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
                  <button
                    className="secondary"
                    disabled={busy}
                    aria-pressed={p.reacted}
                    onClick={() => void react(p)}
                  >
                    <Heart
                      size={19}
                      fill={p.reacted ? "currentColor" : "none"}
                      aria-hidden="true"
                    />{" "}
                    Like · {p.reactions}
                  </button>
                  <button
                    className="secondary"
                    aria-expanded={openComments === p.id}
                    onClick={() =>
                      setOpenComments(openComments === p.id ? null : p.id)
                    }
                  >
                    <MessageCircle size={19} aria-hidden="true" /> Comment ·{" "}
                    {p.comments}
                  </button>
                </div>
                <details className="post-options">
                  <summary aria-label="Post options">•••</summary>
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
            {rows.length >= limit && limit < 100 ? (
              <button
                className="secondary"
                onClick={() => setLimit((n) => n + 20)}
              >
                Load more posts
              </button>
            ) : null}
            {admin && reports.length ? (
              <details className="community-composer">
                <summary>Moderation · Latest reports</summary>
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
              </details>
            ) : null}
          </>
        )}
      </div>
    </Shell>
  );
}
