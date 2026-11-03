import { isSport, type Sport } from "./sports";

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
): StoryPost | null {
  if (!current.viewerId || !uuid.test(current.viewerId) ||
      request.viewerId !== current.viewerId || request.generation !== current.generation ||
      !record(data) || data.id !== request.postId ||
      typeof data.id !== "string" || !uuid.test(data.id) ||
      typeof data.user_id !== "string" || !uuid.test(data.user_id) ||
      typeof data.author_name !== "string" || !data.author_name.trim() ||
      typeof data.sport !== "string" || !isSport(data.sport) ||
      typeof data.created_at !== "string" || !Number.isFinite(Date.parse(data.created_at))) return null;
  // Do not forward arbitrary payload fields (email, role claims, photos or transfer data).
  return { id: data.id, user_id: data.user_id, author_name: data.author_name,
    sport: data.sport, created_at: data.created_at };
}

/** Group by authoritative author UUID, never the username snapshot. Newest author first;
 * within an author, oldest → newest. Ties use stable IDs. No inferred 24-hour expiry. */
export function storyGroups(posts: StoryPost[]): StoryGroup[] {
  const byId = new Map<string, StoryPost[]>();
  for (const p of posts) byId.set(p.id, [...(byId.get(p.id) || []), p]);
  const groups = new Map<string, StoryPost[]>();
  for (const candidates of byId.values()) {
    const p = candidates[0];
    // Conflicting identity/version duplicates require re-fetch, not arbitrary selection.
    if (candidates.some(x => JSON.stringify(x) !== JSON.stringify(p))) continue;
    if (!uuid.test(p.id) || !uuid.test(p.user_id) || !isSport(p.sport) ||
        !Number.isFinite(Date.parse(p.created_at))) continue;
    groups.set(p.user_id, [...(groups.get(p.user_id) || []), p]);
  }
  return [...groups].map(([authorId, rows]) => ({ authorId, posts: rows.sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => Date.parse(b.posts.at(-1)!.created_at) - Date.parse(a.posts.at(-1)!.created_at)
      || a.authorId.localeCompare(b.authorId));
}

/** A missing/removed current item and either end return null. Never wrap or silently jump. */
export function stepStory(groups: StoryGroup[], cursor: StoryCursor, direction: -1 | 1): StoryCursor | null {
  const flat = groups.flatMap(g => g.posts.map(p => ({ authorId: g.authorId, postId: p.id })));
  const index = flat.findIndex(p => p.authorId === cursor.authorId && p.postId === cursor.postId);
  return index < 0 ? null : flat[index + direction] || null;
}

/** Call only after meaningful content is rendered. A rail click or failed load is not a view. */
export function displayedStoryRead(
  seen: string[], post: StoryPost | null, request: StoryRequest,
  current: { viewerId: string | null; generation: number }, displayed: boolean,
): string[] {
  if (!displayed || !post || !storyDetail(post, request, current)) return [...seen];
  return [...new Set([...seen, post.id])].slice(-2000);
}

export function storyDiscussion(post: StoryPost): string {
  return `/community?sport=${encodeURIComponent(post.sport)}&post=${encodeURIComponent(post.id)}#post-${encodeURIComponent(post.id)}`;
}
