/** The Zone's single feed: member posts and VIP lays in one timeline, newest first. */

export type FeedItem<P, L> =
  | { kind: "post"; at: string; id: string; post: P }
  | { kind: "lay"; at: string; id: string; lay: L };

export function zoneFeed<
  P extends { id: string; created_at: string },
  L extends { id: string; created_at: string },
>(posts: P[], lays: L[], vipOnly = false): FeedItem<P, L>[] {
  const items: FeedItem<P, L>[] = [
    ...(vipOnly
      ? []
      : posts.map((post) => ({
          kind: "post" as const,
          at: post.created_at,
          id: post.id,
          post,
        }))),
    ...lays.map((lay) => ({
      kind: "lay" as const,
      at: lay.created_at,
      id: lay.id,
      lay,
    })),
  ];
  return items.sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id),
  );
}

/** "now", "5m", "3h", "2d", then "Oct 24" (ET), like a social feed. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
}

/** Up to two letters for an avatar without a photo ("MikeQ" → "MQ", "sharp_bettor" → "SB"). */
export function initials(name: string) {
  const parts = (name || "")
    .replace(/[^A-Za-z0-9_ ]/g, "")
    .split(/[_\s]+|(?=[A-Z])/)
    .filter(Boolean);
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[1][0]
      : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}
