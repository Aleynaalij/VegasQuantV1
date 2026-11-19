import { gameZonePosts } from "./game-zone-posts";
import type { HomeDealerResult } from "./home-dealer";
import { stageDealerPosts } from "./stage-dealer-contract";
/** Invalidations discard earlier responses even if cancellation is ignored.
 * This does not pretend to observe HttpOnly cookie changes immediately.
 */
export function createStageDealerReader(
  publish: (result: HomeDealerResult) => void,
  clear: () => void,
  transport: typeof fetch = fetch,
) {
  let generation = 0,
    disposed = false;
  let pending: AbortController | undefined;
  const invalidate = () => {
    ++generation;
    pending?.abort();
    pending = undefined;
    clear();
  };
  const read = async (sport: string) => {
    if (disposed) return;
    invalidate();
    const own = generation,
      controller = new AbortController();
    pending = controller;
    let result: HomeDealerResult = { state: "error", posts: [] };
    try {
      const response = await transport(
        `/staging/discovery/read/dealer?sport=${encodeURIComponent(sport)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(6000),
          ]),
        },
      );
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("application/json")
      ) {
        const payload = await response.json();
        const posts = stageDealerPosts(payload?.posts, sport);
        if (payload?.state === "ready" && posts)
          result = { state: "ready", posts: gameZonePosts(posts) };
      }
    } catch {
      /* No previous content survives a failed reread. */
    }
    if (!disposed && own === generation && !controller.signal.aborted) {
      pending = undefined;
      publish(result);
    }
  };
  return {
    read,
    invalidate,
    dispose: () => {
      disposed = true;
      invalidate();
    },
  };
}
