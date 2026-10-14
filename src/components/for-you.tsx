"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
import { summarizeTails } from "@/lib/tail-record";
import {
  forYou,
  type Follow,
  type ForYouGame,
  type ForYouItem,
  type ForYouPost,
} from "@/lib/for-you";

// Signed-in Home block: followed teams and players, plus the member's tailed-pick record.
export default function ForYou({ games }: { games: ForYouGame[] }) {
  const [uid, setUid] = useState<string | null>(null),
    [items, setItems] = useState<ForYouItem[] | null>(null),
    [tails, setTails] = useState<ReturnType<typeof summarizeTails> | null>(
      null,
    );
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
      const [f, p, t] = await Promise.all([
        supabase.from("topic_follows").select("kind,topic").eq("user_id", id),
        supabase
          .from("research_feed_posts")
          .select("id,title,matchup,summary,game_id,created_at")
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("leg_tails")
          .select("leg_key")
          .eq("user_id", id)
          .limit(500),
      ]);
      if (!live || n !== epoch) return;
      setItems(
        f.error
          ? []
          : forYou(
              (f.data || []) as Follow[],
              games,
              (p.data || []) as ForYouPost[],
            ),
      );
      if (!t.error && t.data?.length) {
        const keys = t.data.map((x) => x.leg_key);
        const results: {
          result: string | null;
          result_source: string | null;
        }[] = [];
        for (let i = 0; i < keys.length; i += 100) {
          const r = await supabase
            .from("published_legs")
            .select("result,result_source")
            .in("leg_key", keys.slice(i, i + 100));
          if (r.error) return;
          results.push(...(r.data || []));
        }
        if (live && n === epoch)
          setTails(
            summarizeTails(results.map((publication) => ({ publication }))),
          );
      } else setTails(null);
    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
    };
  }, [games]);
  if (!uid || items === null) return null;
  return (
    <section className="vq-foryou" aria-label="For you">
      <header>
        <h2>For you</h2>
        <Link href="/membership#follow">
          {items.length ? "Edit follows" : "Follow teams"} →
        </Link>
      </header>
      {tails && (
        <Link className="vq-foryou-tails" href="/history">
          <span>Your tailed picks</span>
          <b>
            {tails.wins}–{tails.losses}
            {tails.pushes ? `–${tails.pushes}` : ""}
          </b>
          <small>{tails.pending} pending</small>
        </Link>
      )}
      {items.length ? (
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
      ) : (
        <p>
          Follow your teams and players to see their next game and newest
          research here, and to get alerts when they’re in a published pick.
        </p>
      )}
    </section>
  );
}
