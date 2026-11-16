"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { watchDiscoveryAccess } from "@/lib/discovery/revalidate";
import {
  homeDealerHref,
  readHomeDealer,
  type HomeDealerResult,
} from "@/lib/home-dealer";
import { zonePostLead } from "@/lib/game-zone-posts";
import { homeTimestamp } from "@/lib/home2";

export default function HomeDealer({
  sport,
  zoneHref,
}: {
  sport: string;
  zoneHref: string;
}) {
  const [result, setResult] = useState<HomeDealerResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Tag responses with the requested sport so a filter change cannot flash old rows.
  const [loadedSport, setLoadedSport] = useState("");
  useEffect(() => {
    let active = true,
      generation = 0;
    const clear = () => {
      ++generation;
      setResult(null);
    };
    const read = async () => {
      const own = ++generation;
      const next = await readHomeDealer(
        {
          authenticated: async () => {
            const { data, error } = await supabase.auth.getUser();
            return !error && !!data.user;
          },
          feed: async (p_sport, p_limit) =>
            supabase.rpc("community_dealer_feed", { p_sport, p_limit }),
        },
        sport,
      );
      if (active && own === generation) {
        setResult(next);
        setLoadedSport(sport);
      }
    };
    clear();
    void read();
    const stop = watchDiscoveryAccess(
      clear,
      () => void read(),
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
  }, [sport, attempt]);
  const current = loadedSport === sport ? result : null;
  return (
    <section aria-labelledby="home2-dealer-title">
      <h3 id="home2-dealer-title">Latest from The Dealer</h3>
      <p>
        Recent publications from the configured Dealer publisher, shown only
        where your account has access. Open a publication for full research and
        discussion.
      </p>
      {!current && <p role="status">Loading Dealer publications…</p>}
      {current?.state === "signed-out" && (
        <p>Sign in to view available Dealer publications.</p>
      )}
      {current?.state === "error" && (
        <p role="status">
          Dealer publications could not load.{" "}
          <button
            type="button"
            className="h2-button secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry Dealer publications
          </button>
        </p>
      )}
      {current?.state === "ready" && !current.posts.length && (
        <p>No Dealer publications returned for this sport and account.</p>
      )}
      <div className="h2-research">
        {current?.state === "ready" &&
          current.posts.map((post) => (
            <article key={post.id} className="h2-research-card">
              <span className="h2-eyebrow">
                The Dealer · {post.sport.toUpperCase()}
              </span>
              <h4>
                <Link href={homeDealerHref(zoneHref, post)}>
                  {post.title || "Dealer publication"}
                </Link>
              </h4>
              <p>
                {zonePostLead(post.body, 220) ||
                  "Open the original publication to inspect its research."}
              </p>
              <p>Published {homeTimestamp(post.created_at)}</p>
              <Link
                className="h2-button secondary"
                href={homeDealerHref(zoneHref, post)}
              >
                Open publication
              </Link>
            </article>
          ))}
      </div>
    </section>
  );
}
