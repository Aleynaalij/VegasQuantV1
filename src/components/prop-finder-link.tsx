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
        ▮▮▯▮
      </span>
      <span>
        <b>{label || "NBA Prop Finder"}</b>
        <small>
          {game
            ? "Every player prop in this game, ranked with hit rates and our estimate"
            : "Every NBA prop tonight, ranked. Search a player, tap for the chart."}
        </small>
      </span>
      <span className="pf-cta-go" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
