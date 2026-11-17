/** Narrow reader result. No identity, storage URL, access token or hidden columns. */
export type StageDealerPost = {
  id: string;
  sport: string;
  title: string;
  body: string;
  created_at: string;
};
export const STAGE_DEALER_SPORTS = ["all", "nba", "nhl", "nfl", "ncaab"];
export function stageDealerPosts(
  value: unknown,
  sport: string,
): StageDealerPost[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const posts: StageDealerPost[] = [];
  for (const row of value) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        row.id,
      ) ||
      !STAGE_DEALER_SPORTS.slice(1).includes(row.sport) ||
      (sport !== "all" && row.sport !== sport) ||
      typeof row.title !== "string" ||
      row.title.length > 160 ||
      typeof row.body !== "string" ||
      row.body.length > 2000 ||
      typeof row.created_at !== "string" ||
      !Number.isFinite(Date.parse(row.created_at))
    )
      return null;
    posts.push({
      id: row.id,
      sport: row.sport,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
    });
  }
  return posts;
}
