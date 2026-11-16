"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { watchDiscoveryAccess } from "@/lib/discovery/revalidate";
import {
  gameZonePosts,
  zonePostHref,
  type GameZonePost,
} from "@/lib/game-zone-posts";
import { nhlChartRef } from "@/lib/nhl-chart-package";
import { weeklyCardRef } from "@/lib/nfl-weekly-cards";
import { positionCardPostId } from "@/lib/nfl-position-card";
import { threesCardDay } from "@/lib/nba-threes-card";
import { nbaMatchupSheetReference } from "@/lib/nba-matchup-sheet";
import { isPublicationCard } from "@/lib/zone-publication-card";
import type { RoomReference } from "@/lib/game-room";
const NhlChart = dynamic(() => import("../nhl-chart-preview"));
const NbaSheet = dynamic(() => import("../nba-matchup-sheet-preview"));
const Threes = dynamic(() =>
  import("../nba-threes-card-preview").then((m) => m.NbaThreesCardPreview),
);
const Publication = dynamic(() => import("../zone-publication-card"));
function FullPublication({
  post,
  userId,
}: {
  post: GameZonePost;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const nhl = nhlChartRef(post.card),
    day = threesCardDay(post.card);
  const nflCard =
    post.sport === "nfl" &&
    (weeklyCardRef(post.card) || positionCardPostId(post));
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Read full publication & available charts</summary>
      {open && (
        <>
          {post.sport === "nhl" && nhl ? (
            <NhlChart id={nhl} body={post.body} />
          ) : post.sport === "nba" && day ? (
            <Threes day={day} body={post.body} />
          ) : nflCard ? (
            <Threes
              day={
                weeklyCardRef(post.card)?.day || post.created_at.slice(0, 10)
              }
              body={post.body}
              image={{
                src: `/api/nfl/weekly-card/${encodeURIComponent(positionCardPostId(post) ? `post-${post.id}` : post.card!)}`,
                alt: `${post.title}. Full text follows.`,
                download: `vegas-quant-${post.id}.png`,
              }}
            />
          ) : nbaMatchupSheetReference(post) ? (
            <NbaSheet id={post.id} userId={userId} />
          ) : isPublicationCard(post) ? (
            <Publication post={post} />
          ) : null}
          <p className="gr-copy">{post.body}</p>
          <p className="gr-muted">
            Publication time is not source freshness. Original text and chart
            source notes are preserved. Other card formats and attachments
            remain at the original publication.
          </p>
        </>
      )}
    </details>
  );
}
/** Opt-in existing RPC only. No team-name matching, new readers, or inferred historical links. */
export default function RoomPublications({
  reference,
}: {
  reference: RoomReference;
}) {
  const [posts, setPosts] = useState<GameZonePost[]>([]);
  const [userId, setUserId] = useState("");
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      generation = 0;
    const clear = () => {
      ++generation;
      setPosts([]);
      setUserId("");
      setState("loading");
    };
    async function load() {
      clear();
      const own = generation;
      try {
        const session = await supabase.auth.getSession();
        if (!active || own !== generation) return;
        if (session.error || !session.data.session) {
          setState("signed-out");
          return;
        }
        const result = await supabase.rpc("game_zone_posts", {
          p_sport: reference.sport,
          p_game: reference.id,
        });
        if (!active || own !== generation) return;
        const rows = gameZonePosts(result.data);
        if (
          result.error ||
          !Array.isArray(result.data) ||
          rows.length !== result.data.length ||
          rows.some((p) => p.sport !== reference.sport)
        ) {
          setState("unavailable");
          return;
        }
        setUserId(session.data.session.user.id);
        setPosts(rows);
        setState(rows.length ? "ready" : "empty");
      } catch {
        if (active && own === generation) setState("unavailable");
      }
    }
    void load();
    const stop = watchDiscoveryAccess(
      clear,
      () => void load(),
      (changed) => {
        const { data } = supabase.auth.onAuthStateChange(changed);
        return () => data.subscription.unsubscribe();
      },
    );
    return () => {
      active = false;
      ++generation;
      stop();
    };
  }, [reference.sport, reference.id, attempt]);
  return (
    <section aria-label="Game-linked publications">
      <h3>Original game-linked publications</h3>
      <p role="status">
        {state === "loading"
          ? "Checking permitted publications…"
          : state === "signed-out"
            ? "Sign in to check permitted publications."
            : state === "unavailable"
              ? "Linked publications could not be verified. Original sport research remains available below."
              : state === "empty"
                ? "No accessible linked publications returned. This can mean missing links or restricted access, not that no research exists."
                : `${posts.length} accessible linked publications returned.`}
      </p>
      {state === "unavailable" && (
        <button onClick={() => setAttempt((n) => n + 1)}>
          Retry publications
        </button>
      )}
      {posts.map((post) => (
        <article className="gr-card" key={post.id}>
          <p className="gr-kicker">{post.author_name || "Original author"}</p>
          <h3>{post.title}</h3>
          <p>
            Published <time dateTime={post.created_at}>{post.created_at}</time>
          </p>
          <p className="gr-muted">Reference: {post.id}</p>
          <FullPublication post={post} userId={userId} />
          <Link href={zonePostHref(post)}>
            Original publication, comments & reactions →
          </Link>
        </article>
      ))}
    </section>
  );
}
