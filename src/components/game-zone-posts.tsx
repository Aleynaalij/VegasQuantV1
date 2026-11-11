"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ago } from "@/lib/zone-feed";
import { isPublicationCard } from "@/lib/zone-publication-card";
import {
  gameZonePosts,
  zonePostHref,
  zonePostLead,
  type GameZonePost,
} from "@/lib/game-zone-posts";
import ZonePublicationCard from "./zone-publication-card";
import "@/app/game-zone-posts.css";

/**
 * "From The Zone" on a matchup page: every post the Dealer published about this game (cheat sheets,
 * matchup research, picks, slate cards), so research in The Zone is also where the game is.
 * Signed-out visitors and games with no posts see nothing.
 */
export default function GameZonePosts({
  sport,
  gameId,
}: {
  sport: string;
  gameId: string;
}) {
  const [posts, setPosts] = useState<GameZonePost[]>([]);
  useEffect(() => {
    let live = true,
      generation = 0;
    async function load() {
      const n = ++generation;
      const { data } = await supabase.auth.getSession();
      if (!live || n !== generation) return;
      if (!data.session) return setPosts([]);
      const r = await supabase.rpc("game_zone_posts", {
        p_sport: sport,
        p_game: gameId,
      });
      if (!live || n !== generation) return;
      setPosts(r.error ? [] : gameZonePosts(r.data));
    }
    void load();
    const sub = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
    };
  }, [sport, gameId]);
  if (!posts.length) return null;
  return (
    <section className="game-zone-posts" aria-labelledby={`gzp-${gameId}`}>
      <header>
        <h2 id={`gzp-${gameId}`}>From The Zone</h2>
        <p>
          {posts.length === 1
            ? "1 post published about this game."
            : `${posts.length} posts published about this game.`}
        </p>
      </header>
      <ol>
        {posts.map((p, i) => (
          <li key={p.id}>
            <details open={i === 0}>
              <summary>
                <b>{p.title}</b>
                <small>
                  {p.author_name ? `${p.author_name} · ` : ""}
                  <time dateTime={p.created_at}>{ago(p.created_at)}</time>
                </small>
              </summary>
              {isPublicationCard(p) ? (
                <ZonePublicationCard post={p} />
              ) : (
                <p className="game-zone-lead">{zonePostLead(p.body)}</p>
              )}
              <div className="game-zone-foot">
                <span>
                  <Heart size={15} aria-hidden="true" /> {p.reactions}
                </span>
                <span>
                  <MessageCircle size={15} aria-hidden="true" /> {p.comments}
                </span>
                <Link href={zonePostHref(p)}>Open in The Zone →</Link>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
