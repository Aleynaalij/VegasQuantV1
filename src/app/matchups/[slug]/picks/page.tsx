import Link from "next/link";
import { notFound } from "next/navigation";
import { getDesk } from "@/lib/data";
import { time } from "@/lib/domain";
import { Shell } from "@/components/ui";
import TeamLogo from "@/components/team-logo";
import PublishedLegBoard from "@/components/published-leg-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game picks | Vegas Quant" };

export default async function GamePicksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const desk = await getDesk();
  const game = desk.games.find(
    (g) => g.slug === slug && (!g.sport || g.sport === "nfl"),
  );
  if (!game) notFound();
  return (
    <Shell active="feed">
      <div className="game-picks-page">
        <nav className="game-picks-breadcrumbs" aria-label="Game navigation">
          <Link href="/">← Home</Link>
          <Link href={`/matchups/${game.slug}`}>Game research →</Link>
        </nav>
        <header className="game-picks-heading">
          <span className="eyebrow">NFL · ALL GAME PICKS</span>
          <div className="game-picks-title">
            <TeamLogo team={game.away_team} size={44} />
            <h1>
              {game.away_team} @ {game.home_team}
            </h1>
            <TeamLogo team={game.home_team} size={44} />
          </div>
          <p>
            {time(game.kickoff)}
            {game.venue ? ` · ${game.venue}` : ""}
          </p>
          <p>
            Every published selection tagged to this game, with its original
            price, case and risk.
          </p>
        </header>
        <PublishedLegBoard key={game.id} gameId={game.id} />
      </div>
    </Shell>
  );
}
