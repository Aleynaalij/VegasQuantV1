import Link from "next/link";
import "@/app/nba-props-board.css";

/** The way into the NBA Prop Finder: the whole slate, or one game's props. */
export default function PropFinderLink({
  game,
  label,
}: {
  /** nba_games id: opens the Prop Finder filtered to that game. */
  game?: string;
  label?: string;
}) {
  return (
    <Link
      className="pf-cta"
      href={game ? `/nba/props?game=${encodeURIComponent(game)}` : "/nba/props"}
    >
      <span className="pf-cta-icon" aria-hidden="true">
        {/* A tiny hit-rate chart: three games over the line, one under. */}
        <svg viewBox="0 0 24 24" width="28" height="28">
          <rect x="2" y="9" width="4" height="13" rx="1.2" />
          <rect x="7.5" y="4" width="4" height="18" rx="1.2" />
          <rect
            className="pf-cta-miss"
            x="13"
            y="14"
            width="4"
            height="8"
            rx="1.2"
          />
          <rect x="18.5" y="7" width="4" height="15" rx="1.2" />
        </svg>
      </span>
      <span>
        <b>{label || "NBA Prop Finder"}</b>
        <small>
          {game
            ? "Every player prop in this game, with hit rates and our projection against the line"
            : "Every NBA prop tonight, ranked. Search a player, tap for the chart."}
        </small>
      </span>
      <span className="pf-cta-go" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
