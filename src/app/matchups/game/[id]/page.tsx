import { redirect } from "next/navigation";
import { getDeskOrEmpty } from "@/lib/data";
import { gamePicksPath } from "@/lib/game-picks";
export const dynamic = "force-dynamic";
// Published legs carry a game id, not a slug: resolve it to the game's "All game picks" page, where
// every published selection for the game is shown with its original price, case and risk. An
// unknown or malformed id goes to the games list rather than a 404.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = /^[0-9a-z-]{1,64}$/i.test(id)
    ? (await getDeskOrEmpty()).games.find((g) => g.id === id)
    : undefined;
  redirect(game ? gamePicksPath(game.slug) : "/matchups");
}
