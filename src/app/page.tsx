import { permanentRedirect } from "next/navigation";
import { getDeskOrEmpty } from "@/lib/data";
import VqLobby from "@/components/vq-lobby";
export const dynamic = "force-dynamic";
/**
 * The neutral Vegas Quant lobby. Old NFL-desk links that carried a game (`/?game=<slug>`, shared and
 * bookmarked before the desk moved to /nfl) keep working: they land on the same game at /nfl with
 * every other query parameter kept. Hash-only links (`/#home-games`) never reach the server; the
 * lobby forwards those in the browser.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (Object.hasOwn(query, "game")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
    permanentRedirect(`/nfl?${params.toString()}#home-games`);
  }
  const desk = await getDeskOrEmpty();
  return <VqLobby nflGames={desk.games} nflUnavailable={Boolean(desk.unavailable)} />;
}
