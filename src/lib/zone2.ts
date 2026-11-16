import type { FeedItem } from "./zone-feed";

export type Zone2Post = {
  id: string;
  title: string;
  body: string;
  sport: string;
  created_at: string;
  card?: string | null;
};
/** Recognized existing publication markers only. A badge/name is not provenance. */
export function zone2Publication(post: Pick<Zone2Post, "card">): boolean {
  const card = post.card || "";
  return (
    card === "vq-publication:v1" ||
    /^nba-threes:\d{4}-\d{2}-\d{2}$/.test(card) ||
    /^nfl-(wr|dvp):\d{4}-\d{2}-\d{2}:\d{1,2}$/.test(card) ||
    /^nhl-charts:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      card,
    )
  );
}
/** Search is deliberately bounded to the already-authorized loaded feed. */
export function filterZone2Feed<
  P extends Zone2Post,
  L extends { id: string; created_at: string; title?: string },
>(
  items: FeedItem<P, L>[],
  options: { query: string; researchOnly: boolean },
): FeedItem<P, L>[] {
  const query = options.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (item.kind === "lay")
      return (
        !options.researchOnly &&
        (!query || (item.lay.title || "").toLocaleLowerCase().includes(query))
      );
    if (options.researchOnly && !zone2Publication(item.post)) return false;
    return (
      !query ||
      [item.post.title, item.post.body, item.post.sport]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}
export function zone2Excerpt(body: string): string {
  const text = body
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}
