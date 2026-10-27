"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { Game } from "@/lib/domain";
import HomeBrief from "./home-brief";
import { useIsAdmin } from "@/lib/use-admin";
export default function HomeFeatureCarousel({ games }: { games: Game[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
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
      <div className="vq-feature-controls" aria-label="Choose a feature">
        <button
          type="button"
          aria-pressed={active === 0}
          onClick={() => slide(0)}
        >
          Kickoff
        </button>
        <button
          type="button"
          aria-pressed={active === 1}
          onClick={() => slide(1)}
        >
          Simulator <span>{admin ? "Preview" : "Coming soon"}</span> →
        </button>
      </div>
      <div
        className="vq-feature-track"
        ref={track}
        tabIndex={0}
        aria-label="Swipe between kickoff and simulator"
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.clientWidth)
            setActive(Math.round(node.scrollLeft / node.clientWidth));
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            slide(event.key === "ArrowRight" ? 1 : 0);
          }
        }}
      >
        <div className="vq-feature-slide">
          <HomeBrief games={games} />
          <button
            type="button"
            className="vq-feature-swipe-cue"
            onClick={() => slide(1)}
          >
            <span aria-hidden="true">←</span> Swipe left for Simulator{" "}
            <span aria-hidden="true">→</span>
          </button>
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
      <div className="vq-feature-position" aria-live="polite">
        <span className={active === 0 ? "is-active" : ""} aria-hidden="true" />
        <span className={active === 1 ? "is-active" : ""} aria-hidden="true" />
        <small>
          {active === 0 ? "1 of 2 · Kickoff" : "2 of 2 · Simulator"}
        </small>
      </div>
    </section>
  );
}
