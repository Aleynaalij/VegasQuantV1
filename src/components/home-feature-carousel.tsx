"use client";
import { useRef } from "react";
import Link from "next/link";
import type { Game } from "@/lib/domain";
import HomeBrief from "./home-brief";
import { useIsAdmin } from "@/lib/use-admin";
export default function HomeFeatureCarousel({ games }: { games: Game[] }) {
  const track = useRef<HTMLDivElement>(null);
  // The preview route is admin-only; members get the teaser without a dead-end link.
  const admin = useIsAdmin();
  function slide(index: number) {
    const node = track.current;
    if (node)
      node.scrollTo({
        left: index * node.clientWidth,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }
  return (
    <section
      className="vq-feature-carousel"
      aria-label="Matchup and simulator"
      data-no-tab-swipe
    >
      <div className="vq-feature-track" ref={track}>
        <div className="vq-feature-slide">
          <HomeBrief games={games} />
        </div>
        <div className="vq-feature-slide vq-simulator-teaser">
          <span className="eyebrow">VEGAS QUANT SIMULATOR</span>
          <h2>Watch the possibilities.</h2>
          <div className="vq-mini-field" aria-hidden="true">
            VQ <span>●</span>
          </div>
          {admin ? (
            <>
              <p>
                The game simulator is being built. The current internal preview
                uses a synthetic demo, not this matchup.
              </p>
              <Link className="vq-btn" href="/simulator">
                Simulator preview →
              </Link>
            </>
          ) : (
            <p>
              The game simulator is being built. Coming soon: watch a simulated
              game and see the range of outcomes.
            </p>
          )}
        </div>
      </div>
      <div className="vq-feature-controls">
        <button onClick={() => slide(0)}>Matchup</button>
        <span>Swipe to explore</span>
        <button onClick={() => slide(1)}>Simulator</button>
      </div>
    </section>
  );
}
