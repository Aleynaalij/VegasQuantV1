"use client";
import { useSearchParams } from "next/navigation";
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
import RubyHub, { RubyCard } from "./ruby-cards";
import type { RubySlip } from "@/lib/ruby";
import CommunityPhoto from "./community-photo";
import CommunityParlayCard from "./community-parlay-card";
import { COMMUNITY_PHOTO_BUCKET } from "@/lib/community-photo";
import {
  MAX_SELECTED_PHOTO_BYTES,
  uploadCommunityPhoto,
} from "@/lib/community-photo-client";
import { time } from "@/lib/domain";
import {
  Gem,
  ImagePlus,
  Heart,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Share2,
} from "lucide-react";
import { ago, initials, zoneFeed } from "@/lib/zone-feed";
import { NBA_PAUSED } from "@/lib/nba-paused";
import { threesCardDay } from "@/lib/nba-threes-card";
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
  card?: string | null;
};
type Comment = {
  parent_id: string | null;
  reactions: number;
  reacted: boolean;
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
  targetComment,
  postId,
  uid,
  admin,
  onChange,
  onBlock,
}: {
  targetComment?: string | null;
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
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const load = useCallback(async () => {
    const r = await supabase.rpc("community_comments", {
      p_post: postId,
      p_target: targetComment || null,
    });
    if (r.error) setNotice("Comments could not load. Try again.");
    else setRows(r.data || []);
  }, [postId, targetComment]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (targetComment && rows.some((c) => c.id === targetComment))
      document
        .getElementById(`comment-${targetComment}`)
        ?.scrollIntoView({ block: "center" });
  }, [rows, targetComment]);
  async function react(c: Comment) {
    if (busy) return;
    setBusy(true);
    const r = c.reacted
      ? await supabase
          .from("community_comment_reactions")
          .delete()
          .eq("comment_id", c.id)
          .eq("user_id", uid)
      : await supabase
          .from("community_comment_reactions")
          .insert({ comment_id: c.id, user_id: uid });
    setBusy(false);
    if (r.error) setNotice("Reaction could not save. Please retry.");
    else await load();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await supabase.from("community_post_comments").insert({
      post_id: postId,
      user_id: uid,
      body: body.trim(),
      parent_id: replyTo?.id || null,
    });
    setBusy(false);
    if (r.error) {
      setNotice(
        "Could not comment. Complete a visible community profile and allow ten seconds between comments.",
      );
      return;
    }
    setBody("");
    setReplyTo(null);
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
        {replyTo && (
          <p>
            Replying to @{replyTo.author_name}{" "}
            <button
              type="button"
              className="text-link"
              onClick={() => setReplyTo(null)}
            >
              Cancel reply
            </button>
          </p>
        )}
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
        <article
          key={c.id}
          id={`comment-${c.id}`}
          className={c.id === targetComment ? "linked-comment" : undefined}
        >
          <strong>@{c.author_name}</strong>
          <small> · {time(c.created_at)}</small>
          {c.parent_id && <small>Reply in this thread</small>}
          <p>{c.body}</p>
          <div className="social-actions">
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setReplyTo(c);
                document.getElementById(`reply-${postId}`)?.focus();
              }}
            >
              Reply
            </button>
            <button
              type="button"
              className="text-link"
              aria-pressed={c.reacted}
              disabled={busy}
              onClick={() => void react(c)}
            >
              {c.reacted ? "Liked" : "Like"} comment · {c.reactions || 0}
            </button>
          </div>
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
  const searchParams = useSearchParams();
  const routeSport = searchParams.get("sport");
  const routePost = searchParams.get("post");
  const targetComment = /^[0-9a-f-]{36}$/i.test(
    searchParams.get("comment") || "",
  )
    ? searchParams.get("comment")
    : null;
  const [uid, setUid] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false),
    [sport, setSport] = useState<"nfl" | "nba">("nfl"),
    [followingOnly, setFollowingOnly] = useState(false),
    [vipOnly, setVipOnly] = useState(
      searchParams.get("view") === "vip" || searchParams.has("ruby"),
    ),
    [lays, setLays] = useState<RubySlip[]>([]),
    [avatars, setAvatars] = useState<Record<string, string>>({}),
    [me, setMe] = useState<{ username: string; avatar: string | null }>({
      username: "",
      avatar: null,
    }),
    [burst, setBurst] = useState<string | null>(null),
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
  useEffect(() => {
    setSport(routeSport === "nba" && !NBA_PAUSED ? "nba" : "nfl");
    setTargetPost(
      routePost && /^[0-9a-f-]{36}$/i.test(routePost) ? routePost : null,
    );
  }, [routeSport, routePost]);
  useEffect(() => {
    if (uid && routePost && targetComment) setOpenComments(routePost);
  }, [uid, routePost, targetComment]);
  const epoch = useRef(0);
  const sessionUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
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
        // While NBA is paused, NBA research posts show in the one Latest feed.
        p_sport: NBA_PAUSED ? "all" : sport,
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
    // VIP lays share the one feed; "Following" stays member posts only.
    const rubyId = searchParams.get("ruby");
    const [cards, one, faces, mine] = await Promise.all([
      followingOnly
        ? Promise.resolve({ data: [] as RubySlip[], error: null })
        : supabase
            .from("ruby_cards")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit),
      rubyId && /^[0-9a-f-]{36}$/i.test(rubyId)
        ? supabase.from("ruby_cards").select("*").eq("id", rubyId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.rpc("community_avatars", {
        p_users: [...new Set(posts.map((p) => p.user_id))].slice(0, 100),
      }),
      supabase
        .from("community_profiles")
        .select("username,avatar")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);
    if (n !== epoch.current) return;
    const laid: RubySlip[] = cards.data || [];
    if (one.data && !laid.some((x) => x.id === one.data.id))
      laid.unshift(one.data);
    setLays(laid);
    if (!faces.error)
      setAvatars((known) => ({
        ...known,
        ...Object.fromEntries(
          ((faces.data || []) as { user_id: string; avatar: string }[]).map(
            (f) => [f.user_id, f.avatar],
          ),
        ),
      }));
    if (mine.data) setMe(mine.data);
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
  }, [uid, sport, limit, followingOnly, targetPost, searchParams]);
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
        uploaded = await uploadCommunityPhoto(
          photo,
          postId,
          session.data.session.access_token,
        );
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
  async function react(p: Post, onlyLike = false) {
    if (!uid || busy || (onlyLike && p.reacted)) return;
    setBusy(true);
    // Instant like, Instagram-style; the server read below settles the count.
    setRows((all) =>
      all.map((x) =>
        x.id === p.id
          ? {
              ...x,
              reacted: !p.reacted,
              reactions: x.reactions + (p.reacted ? -1 : 1),
            }
          : x,
      ),
    );
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
  async function sharePost(p: Post) {
    if (busy || !uid) return;
    setBusy(true);
    try {
      const url = `${location.origin}/community?sport=${p.sport}&post=${p.id}#post-${p.id}`;
      if (navigator.share)
        await navigator.share({ title: "Vegas Quant community post", url });
      else await navigator.clipboard.writeText(url);
      const r = await supabase
        .from("community_shares")
        .upsert(
          { post_id: p.id, user_id: uid },
          { onConflict: "post_id,user_id", ignoreDuplicates: true },
        );
      setNotice(
        r.error
          ? "Link shared. The activity receipt could not save."
          : "Post link shared.",
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice("Could not share this post. Please retry.");
    } finally {
      setBusy(false);
    }
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
  const feed = zoneFeed(rows, lays, vipOnly);
  const face = (name: string, avatar: string | null | undefined, size = 44) =>
    avatar ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="zone-avatar"
        src={avatar}
        alt=""
        width={size}
        height={size}
      />
    ) : (
      <span
        className="zone-avatar zone-avatar-initials"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
    );
  return (
    <Shell active="community" sport={sport}>
      <div className="community-feed zone-feed">
        <header className="zone-head">
          <h1>The Zone</h1>
          <p>Takes, lays and research from the Vegas Quant floor.</p>
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
          <p className="zone-status">Checking your session…</p>
        ) : !uid ? (
          <section className="zone-join">
            <Gem size={22} aria-hidden="true" />
            <h2>Join the conversation</h2>
            <p>
              A free account lets you read member posts and VIP lays. Complete
              your visible profile to publish and comment.
            </p>
            <Link className="primary" href="/membership">
              Sign in or create an account
            </Link>
          </section>
        ) : (
          <>
            <form className="zone-composer" onSubmit={post}>
              <fieldset disabled={busy}>
                <div className="zone-composer-row">
                  {face(me.username || "You", me.avatar)}
                  <label className="sr-only" htmlFor="community-message">
                    Your post
                  </label>
                  <textarea
                    id="community-message"
                    maxLength={2000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Share a take, a lay or a photo…"
                    rows={body ? 3 : 1}
                  />
                </div>
                {preview ? (
                  <div className="zone-composer-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Photo preview before publishing" />
                    <button
                      className="zone-chip"
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
                <div className="zone-composer-bar">
                  <label className="zone-icon-button" title="Attach a photo">
                    <ImagePlus size={20} aria-hidden="true" />
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
                          file.size > MAX_SELECTED_PHOTO_BYTES ||
                          !["image/jpeg", "image/png", "image/webp"].includes(
                            file.type,
                          )
                        ) {
                          setNotice("Choose a JPG, PNG or WebP under 25 MB.");
                          e.target.value = "";
                          setPhoto(null);
                          return;
                        }
                        setPhoto(file);
                        setNotice("");
                      }}
                    />
                  </label>
                  <Link className="zone-profile-link" href="/membership">
                    Profile
                  </Link>
                  <button
                    className="zone-post-button"
                    disabled={busy || (!body.trim() && !photo)}
                  >
                    {busy ? "Posting…" : "Post"}
                  </button>
                </div>
                {notice && (
                  <p role="status" className="zone-notice">
                    {notice}
                  </p>
                )}
              </fieldset>
            </form>
            {vipOnly ? null : <RubyHub composerOnly />}
            <div className="zone-tabs" role="tablist" aria-label="Feed">
              {(
                [
                  [
                    "For you",
                    !followingOnly && !vipOnly,
                    () => {
                      setFollowingOnly(false);
                      setVipOnly(false);
                    },
                  ],
                  [
                    "Following",
                    followingOnly,
                    () => {
                      setFollowingOnly(true);
                      setVipOnly(false);
                    },
                  ],
                  [
                    "VIP lays",
                    vipOnly,
                    () => {
                      setFollowingOnly(false);
                      setVipOnly(true);
                    },
                  ],
                ] as const
              ).map(([label, on, pick]) => (
                <button
                  key={label}
                  role="tab"
                  aria-selected={on}
                  className={on ? "is-active" : ""}
                  onClick={() => {
                    pick();
                    setLimit(20);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="zone-refresh"
                aria-label="Refresh"
                disabled={loading}
                onClick={() => void refresh()}
              >
                <RefreshCw
                  size={17}
                  className={loading ? "is-spinning" : ""}
                  aria-hidden="true"
                />
              </button>
            </div>
            {targetMissing ? (
              <p role="status" className="zone-status">
                This post is no longer available.
              </p>
            ) : null}
            {vipOnly ? (
              <RubyHub zone selectedId={searchParams.get("ruby") || ""} />
            ) : null}
            {!vipOnly && !loading && feed.length === 0 ? (
              <section className="zone-join">
                <h2>
                  {followingOnly
                    ? "Follow someone to build your feed."
                    : vipOnly
                      ? "No VIP lays yet today."
                      : "Be the first to start the conversation."}
                </h2>
                <p>
                  Which player benefits most from the latest injury news? Bring
                  a source and your perspective.
                </p>
              </section>
            ) : null}
            {(vipOnly ? [] : feed).map((item) =>
              item.kind === "lay" ? (
                <div className="zone-lay" key={`lay-${item.id}`}>
                  <span className="zone-lay-tag">
                    <Gem size={13} aria-hidden="true" /> VIP lay
                    <time dateTime={item.at}>{ago(item.at)}</time>
                  </span>
                  <RubyCard
                    slip={item.lay}
                    admin={admin}
                    onFeatured={() => void refresh()}
                  />
                </div>
              ) : (
                (() => {
                  const p = item.post;
                  return (
                    <article
                      className={`zone-post ${p.id === targetPost ? "linked-post" : ""}`}
                      id={`post-${p.id}`}
                      key={p.id}
                    >
                      <header className="zone-post-head">
                        <Link
                          className="zone-author"
                          href={`/community/${encodeURIComponent(p.author_name)}`}
                        >
                          {face(p.author_name, avatars[p.user_id])}
                          <span>
                            <b>{p.author_name}</b>
                            <small>
                              @{p.author_name} ·{" "}
                              <time
                                dateTime={p.created_at}
                                title={time(p.created_at)}
                              >
                                {ago(p.created_at)}
                              </time>
                            </small>
                          </span>
                        </Link>
                        {p.user_id !== uid ? (
                          <button
                            className={`zone-follow ${p.following ? "is-on" : ""}`}
                            disabled={busy}
                            aria-pressed={p.following}
                            onClick={() => void follow(p)}
                          >
                            {p.following ? "Following" : "Follow"}
                          </button>
                        ) : null}
                      </header>
                      {p.kind !== "talk" || p.sport === "nba" ? (
                        <div className="zone-post-tags">
                          {p.kind !== "talk" ? (
                            <span>{kinds[p.kind]}</span>
                          ) : null}
                          {p.sport === "nba" ? <span>NBA</span> : null}
                          {p.kind === "result" ? (
                            <span className="is-warn">Unverified result</span>
                          ) : null}
                        </div>
                      ) : null}
                      {p.title !== "Community post" ? (
                        <h2 className="zone-post-title">{p.title}</h2>
                      ) : null}
                      {threesCardDay(p.card) ? (
                        <figure
                          className="zone-card zone-media"
                          onDoubleClick={() => {
                            setBurst(p.id);
                            void react(p, true);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/nba/threes-card/${threesCardDay(p.card)}`}
                            alt={p.body}
                            width={1080}
                            height={1350}
                            loading="lazy"
                          />
                          {burst === p.id ? (
                            <Heart
                              className="zone-burst"
                              size={96}
                              fill="currentColor"
                              aria-hidden="true"
                              onAnimationEnd={() => setBurst(null)}
                            />
                          ) : null}
                          <figcaption>
                            <a
                              href={`/api/nba/threes-card/${threesCardDay(p.card)}`}
                              download={`vegas-quant-3-point-volume-${threesCardDay(p.card)}.png`}
                            >
                              Download card
                            </a>
                          </figcaption>
                        </figure>
                      ) : (
                        <p className="zone-post-body">{p.body}</p>
                      )}
                      {p.photo_path ? (
                        <div
                          className="zone-media"
                          onDoubleClick={() => {
                            setBurst(p.id);
                            void react(p, true);
                          }}
                        >
                          <CommunityPhoto
                            key={`${uid}:${p.id}`}
                            path={p.photo_path}
                            title={p.title}
                          />
                          {burst === p.id ? (
                            <Heart
                              className="zone-burst"
                              size={96}
                              fill="currentColor"
                              aria-hidden="true"
                              onAnimationEnd={() => setBurst(null)}
                            />
                          ) : null}
                        </div>
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
                        <small className="zone-stake">
                          Member-shared stake: ${Number(p.stake).toFixed(2)}
                        </small>
                      ) : null}
                      <div className="zone-actions">
                        <button
                          className={p.reacted ? "is-liked" : ""}
                          disabled={busy}
                          aria-pressed={p.reacted}
                          aria-label={p.reacted ? "Unlike" : "Like"}
                          onClick={() => void react(p)}
                        >
                          <Heart
                            size={21}
                            fill={p.reacted ? "currentColor" : "none"}
                            aria-hidden="true"
                          />
                          <span>{p.reactions || ""}</span>
                        </button>
                        <button
                          aria-expanded={openComments === p.id}
                          aria-label="Comments"
                          onClick={() =>
                            setOpenComments(openComments === p.id ? null : p.id)
                          }
                        >
                          <MessageCircle size={21} aria-hidden="true" />
                          <span>{p.comments || ""}</span>
                        </button>
                        <button
                          type="button"
                          aria-label="Share"
                          disabled={busy}
                          onClick={() => void sharePost(p)}
                        >
                          <Share2 size={20} aria-hidden="true" />
                        </button>
                        <details className="post-options zone-more">
                          <summary aria-label="Post options">
                            <MoreHorizontal size={20} aria-hidden="true" />
                          </summary>
                          {uid !== p.user_id ? (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void block(p.user_id, p.author_name)
                              }
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
                              <textarea
                                name="reason"
                                required
                                maxLength={500}
                              />
                            </label>
                            <button className="secondary">Submit report</button>
                          </form>
                        </details>
                      </div>
                      {openComments === p.id ? (
                        <Comments
                          targetComment={targetComment}
                          key={`${uid}:${p.id}`}
                          onBlock={block}
                          postId={p.id}
                          uid={uid}
                          admin={admin}
                          onChange={() => void refresh()}
                        />
                      ) : null}
                    </article>
                  );
                })()
              ),
            )}
            {!vipOnly && rows.length >= limit && limit < 100 ? (
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
