"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
import TailedParlays from "./tailed-parlays";
import FollowButton from "./follow-button";
import AlertsNudge from "./alerts-nudge";
import {
  forYou,
  suggestedTeams,
  type Follow,
  type ForYouGame,
  type ForYouItem,
  type ForYouPost,
} from "@/lib/for-you";

// Signed-in Home block: followed teams and players, plus the member's tailed-pick record.
export default function ForYou({ games }: { games: ForYouGame[] }) {
  const [uid, setUid] = useState<string | null>(null),
    [items, setItems] = useState<ForYouItem[] | null>(null),
    [follows, setFollows] = useState<Follow[]>([]);
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const n = ++epoch;
      const s = await supabase.auth.getSession();
      const id = s.data.session?.user.id || null;
      if (!live || n !== epoch) return;
      setUid(id);
      if (!id) return;
      const [f, p] = await Promise.all([
        supabase.from("topic_follows").select("kind,topic").eq("user_id", id),
        supabase
          .from("research_feed_posts")
          .select("id,title,matchup,summary,game_id,created_at")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      if (!live || n !== epoch) return;
      setFollows(f.error ? [] : ((f.data || []) as Follow[]));
      setItems(
        f.error
          ? []
          : forYou(
              (f.data || []) as Follow[],
              games,
              (p.data || []) as ForYouPost[],
            ),
      );

    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    const refresh = () => void load();
    window.addEventListener("vq-follows-changed", refresh);
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
      window.removeEventListener("vq-follows-changed", refresh);
    };
  }, [games]);
  if (!uid || items === null) return null;
  const suggestions = suggestedTeams(games, follows);
  return (
    <section className="vq-foryou" aria-label="For you">
      <header>
        <h2>For you</h2>
        <Link href="/membership#follow">
          {items.length ? "Edit follows" : "Follow teams"} →
        </Link>
      </header>
      <TailedParlays />
      {items.length > 0 && (
        <ul>
          {items.slice(0, 5).map(({ follow, game, post }) => (
            <li key={`${follow.kind}:${follow.topic}`}>
              <b>{follow.topic}</b>
              {game && (
                <Link href={`/matchups/${game.slug}`}>
                  Next: {game.away_team} @ {game.home_team} ·{" "}
                  {time(game.kickoff)}
                </Link>
              )}
              {post ? (
                <Link href="/feed">Latest: {post.title}</Link>
              ) : (
                <small>No new research yet.</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <AlertsNudge
          subject={
            follows.length === 1 ? follows[0].topic : "the teams and players you follow"
          }
        />
      )}
      {!items.length && (
        <p>
          Tap your teams to see their next game and newest research here.
        </p>
      )}
      {suggestions.length > 0 && items.length < 3 && (
        <div className="vq-foryou-pick" aria-label="Teams playing this week">
          <small>{items.length ? "More teams this week" : "Playing this week"}</small>
          {suggestions.slice(0, 12).map((t) => (
            <FollowButton
              key={t}
              topic={t}
              label={t.split(" ").at(-1)}
              compact
              following={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}
