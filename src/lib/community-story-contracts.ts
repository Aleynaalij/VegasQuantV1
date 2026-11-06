import { isSport, type Sport } from "./sports";

/** Story presentation expires independently of the original Zone post. */
export const STORY_TTL_MS = 86_400_000;
export const STORY_CLOCK_MAX_AGE_MS = 300_000;
export const STORY_CLOCK_MAX_RTT_MS = 30_000;
/** Epoch server time anchored to performance.now(), never to the device's wall clock. */
export type StoryClock = Readonly<{ serverNowMs: number; receivedAtMs: number }>;
const timestamp = (value: unknown): number | null => {
  // A timezone is required: parsing a local date would depend on the member's device settings.
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
export function storyExpiresAt(createdAt: unknown): number | null {
  const created = timestamp(createdAt);
  return created === null ? null : created + STORY_TTL_MS;
}
export function storyEligible(createdAt: unknown, serverNowMs: number | null): boolean {
  const created = timestamp(createdAt);
  return created !== null && typeof serverNowMs === "number" && Number.isFinite(serverNowMs)
    && created <= serverNowMs && serverNowMs < created + STORY_TTL_MS;
}
/** Use performance.now() before dispatch and after receipt. Upper-bound transit conservatively;
 * a delayed answer can shorten visibility by at most its RTT, but cannot extend the lifetime. */
export function serverClock(serverNow: unknown, sentAtMs: number, receivedAtMs: number): StoryClock | null {
  const epoch = timestamp(serverNow);
  const rtt = receivedAtMs - sentAtMs;
  if (epoch === null || !Number.isFinite(sentAtMs) || !Number.isFinite(receivedAtMs)
      || sentAtMs < 0 || rtt < 0 || rtt > STORY_CLOCK_MAX_RTT_MS) return null;
  return { serverNowMs: epoch + rtt, receivedAtMs };
}
/** Missing/stale/backward samples fail closed. Resync on focus/visibility/pageshow before display. */
export function storyNow(clock: StoryClock | null, monotonicNowMs: number): number | null {
  if (!clock || !Number.isFinite(clock.serverNowMs) || !Number.isFinite(clock.receivedAtMs)
      || !Number.isFinite(monotonicNowMs)) return null;
  const elapsed = monotonicNowMs - clock.receivedAtMs;
  return elapsed < 0 || elapsed >= STORY_CLOCK_MAX_AGE_MS ? null : clock.serverNowMs + elapsed;
}

/** Presentation input ONLY: callers must obtain each row through viewer-authorized reads.
 * This module cannot authorize raw rows, signed image URLs or an activity-rail hint. */
export type StoryPost = {
  id: string;
  user_id: string;
  author_name: string;
  sport: Sport;
  created_at: string;
};
export type StoryGroup = { authorId: string; posts: StoryPost[] };
export type StoryCursor = { authorId: string; postId: string };
export type StoryRequest = { viewerId: string; generation: number; postId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Reject stale responses across sign-out/account switch, wrong IDs and malformed payloads. */
export function storyDetail(
  data: unknown,
  request: StoryRequest,
  current: { viewerId: string | null; generation: number },
  serverNowMs: number | null = null,
): StoryPost | null {
  if (!current.viewerId || !uuid.test(current.viewerId) ||
      request.viewerId !== current.viewerId || request.generation !== current.generation ||
      !record(data) || data.id !== request.postId ||
      typeof data.id !== "string" || !uuid.test(data.id) ||
      typeof data.user_id !== "string" || !uuid.test(data.user_id) ||
      typeof data.author_name !== "string" || !data.author_name.trim() ||
      typeof data.sport !== "string" || !isSport(data.sport) ||
      typeof data.created_at !== "string" || !storyEligible(data.created_at, serverNowMs)) return null;
  // Do not forward arbitrary payload fields (email, role claims, photos or transfer data).
  return { id: data.id, user_id: data.user_id, author_name: data.author_name,
    sport: data.sport, created_at: data.created_at };
}

/** Group by authoritative author UUID, never the username snapshot. Newest author first;
 * within an author, oldest → newest. Ties use stable IDs. Only the original server-created 24-hour window is eligible. */
export function storyGroups(posts: StoryPost[], serverNowMs: number | null = null): StoryGroup[] {
  const byId = new Map<string, StoryPost[]>();
  for (const p of posts) byId.set(p.id, [...(byId.get(p.id) || []), p]);
  const groups = new Map<string, StoryPost[]>();
  for (const candidates of byId.values()) {
    const p = candidates[0];
    // Conflicting identity/version duplicates require re-fetch, not arbitrary selection.
    if (candidates.some(x => JSON.stringify(x) !== JSON.stringify(p))) continue;
    if (!uuid.test(p.id) || !uuid.test(p.user_id) || !isSport(p.sport) ||
        !storyEligible(p.created_at, serverNowMs)) continue;
    groups.set(p.user_id, [...(groups.get(p.user_id) || []), p]);
  }
  return [...groups].map(([authorId, rows]) => ({ authorId, posts: rows.sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => Date.parse(b.posts.at(-1)!.created_at) - Date.parse(a.posts.at(-1)!.created_at)
      || a.authorId.localeCompare(b.authorId));
}

/** Keep original sequence order while skipping expired neighbors. An expired current item can
 * advance coherently; a missing current item or either boundary returns null. Never wrap. */
export function stepStory(groups: StoryGroup[], cursor: StoryCursor, direction: -1 | 1,
  serverNowMs: number | null = null): StoryCursor | null {
  const flat = groups.flatMap(g => g.posts.map(p => ({ authorId: g.authorId, post: p })));
  const index = flat.findIndex(p => p.authorId === cursor.authorId && p.post.id === cursor.postId);
  if (index < 0) return null;
  for (let n = index + direction; n >= 0 && n < flat.length; n += direction) {
    const p = flat[n];
    if (storyEligible(p.post.created_at, serverNowMs)) return { authorId: p.authorId, postId: p.post.id };
  }
  return null;
}

/** Call only after meaningful content is rendered. A rail click or failed load is not a view. */
export function displayedStoryRead(
  seen: string[], post: StoryPost | null, request: StoryRequest,
  current: { viewerId: string | null; generation: number }, displayed: boolean,
  serverNowMs: number | null = null,
): string[] {
  if (!displayed || !post || !storyDetail(post, request, current, serverNowMs)) return [...seen];
  return [...new Set([...seen, post.id])].slice(-2000);
}

export function storyDiscussion(post: StoryPost): string {
  return `/community?sport=${encodeURIComponent(post.sport)}&post=${encodeURIComponent(post.id)}#post-${encodeURIComponent(post.id)}`;
}
