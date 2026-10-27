"use client";
import { useRef } from "react";
import Link from "next/link";
import type { Game } from "@/lib/domain";
import HomeBrief from "./home-brief";
export default function HomeFeatureCarousel({ games }: { games: Game[] }) {
  const track = useRef<HTMLDivElement>(null);
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
          <p>
            The game simulator is being built. The current internal preview uses
            a synthetic demo, not this matchup.
          </p>
          <Link className="vq-btn" href="/simulator">
            Simulator preview →
          </Link>
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
