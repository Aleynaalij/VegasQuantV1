export type CommunityActivity = {
  post_id: string;
  username: string;
  avatar: string | null;
  sport: string;
  created_at?: string;
};

export function unreadStories(rows: CommunityActivity[], seen: string[]) {
  const read = new Set(seen);
  return rows
    .filter((row) => !read.has(row.post_id))
    .sort(
      (a, b) =>
        (Date.parse(b.created_at || "") || 0) -
          (Date.parse(a.created_at || "") || 0) ||
        b.post_id.localeCompare(a.post_id),
    );
}
export const storyReadKey = (userId: string) => `vq-community-read:${userId}`;
export function readStories(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storyReadKey(userId)) || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
