import { gameZonePosts, type GameZonePost } from "./game-zone-posts";

export const HOME_DEALER_LIMIT = 3;
export type HomeDealerResult = {
  state: "ready" | "signed-out" | "error";
  posts: GameZonePost[];
};
type Reader = {
  authenticated: () => Promise<boolean>;
  feed: (
    sport: string,
    limit: number,
  ) => Promise<{ data: unknown; error: unknown }>;
};
/** Only the existing identity-verified Dealer RPC can supply these previews.
 * Its invoker rights retain community RLS. No author-name/card-tag inference.
 */
export async function readHomeDealer(
  reader: Reader,
  sport: string,
): Promise<HomeDealerResult> {
  try {
    if (!(await reader.authenticated()))
      return { state: "signed-out", posts: [] };
    const result = await reader.feed(sport, HOME_DEALER_LIMIT);
    if (result.error) return { state: "error", posts: [] };
    if (!Array.isArray(result.data)) return { state: "error", posts: [] };
    return {
      state: "ready",
      posts: gameZonePosts(result.data).slice(0, HOME_DEALER_LIMIT),
    };
  } catch {
    return { state: "error", posts: [] };
  }
}
export function homeDealerHref(
  zoneHref: string,
  post: Pick<GameZonePost, "id" | "sport">,
) {
  const [path, query = ""] = zoneHref.split("#")[0].split("?");
  const params = new URLSearchParams(query);
  params.set("sport", post.sport);
  params.set("post", post.id);
  params.delete("view"); // Direct post lookup must not be hidden by a feed mode.
  return `${path}?${params.toString()}#post-${encodeURIComponent(post.id)}`;
}
