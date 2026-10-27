import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Game } from "@/lib/domain";
import { footballPickGames, gamePicksPath } from "@/lib/game-picks";
import TeamLogo from "./team-logo";

export default function GamePicksShortcut({ games }: { games: Game[] }) {
  const slate = footballPickGames(games);
  if (!slate.length) return null;
  return (
    <section
      className="game-picks-shortcut"
      aria-labelledby="football-picks-title"
    >
      <header>
        <span className="eyebrow">NFL · GAME PICKS</span>
        <h2 id="football-picks-title">Find your game. See every pick.</h2>
      </header>
      <div className="game-picks-links">
        {slate.map((game) => (
          <Link
            href={gamePicksPath(game.slug)}
            key={game.id}
            className="game-picks-link"
          >
            <span className="game-picks-teams" aria-hidden="true">
              <TeamLogo team={game.away_team} size={36} />
              <TeamLogo team={game.home_team} size={36} />
            </span>
            <span className="game-picks-label">
              <strong>
                {game.away_team} @ {game.home_team}
              </strong>
              <small>
                {new Date(game.kickoff).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET
              </small>
              <b>View all game picks</b>
            </span>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
