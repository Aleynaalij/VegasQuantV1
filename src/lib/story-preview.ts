import type { CommunityActivity } from "./community-stories";
import type { StoryPost } from "./community-story-contracts";

/** In-memory test content only. No IDs in this collection belong to real posts/accounts. */
export type PreviewPost = StoryPost & {
  title: string;
  body: string;
  legs: string[];
  photo_path: null;
};
export type StoryPreview = {
  viewerId: string;
  posts: PreviewPost[];
  members: CommunityActivity[];
};
export function buildStoryPreview(
  viewerId: string,
  roster: unknown,
  serverNow: unknown,
): StoryPreview {
  const timestamp = typeof serverNow === "string" ? Date.parse(serverNow) : NaN;
  if (!Array.isArray(roster) || !Number.isFinite(timestamp))
    throw Error("Preview unavailable");
  const names = new Set<string>();
  const profiles = roster
    .filter((row): row is { username: string; avatar?: string | null } => {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.username !== "string" ||
        !row.username.trim()
      )
        return false;
      const name = row.username.trim().toLowerCase();
      if (names.has(name)) return false;
      names.add(name);
      return true;
    })
    .slice(0, 500);
  const posts: PreviewPost[] = profiles.map((row, index) => ({
    id: `feed0000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    user_id: `face0000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    author_name: row.username,
    sport: "nfl",
    created_at: new Date(timestamp - index).toISOString(),
    title: "Your story preview",
    body: "This is a test story to check the home screen and click through every member. It was not posted by this member. Nothing here is published or saved.",
    legs: [],
    photo_path: null,
  }));
  return {
    viewerId,
    posts,
    members: posts.map((post, index) => ({
      post_id: post.id,
      username: post.author_name,
      avatar:
        typeof profiles[index].avatar === "string"
          ? profiles[index].avatar!
          : null,
      sport: post.sport,
      created_at: post.created_at,
    })),
  };
}
