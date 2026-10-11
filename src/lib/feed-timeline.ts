type Dated = { id: string; created_at: string };
type Edge = { official_pick_id: string; created_at: string };

/** Merge publication streams before paging; edits never change publication order. */
export function feedTimeline<
  P extends Dated & { category: string },
  S extends Dated & { candidates?: { supersedes_release_id?: string }[] },
  E extends Edge,
>(posts: P[], selections: S[], edges: E[], filter: string) {
  // Show the latest price revision in the feed; original publications remain in Records.
  const superseded = new Set(selections.flatMap(s =>
    (s.candidates || []).flatMap(c => c.supersedes_release_id ? [c.supersedes_release_id] : []),
  ));
  const items = [
    ...posts
      .filter((p) => filter === "All" || p.category === filter)
      .map((value) => ({
        kind: "post" as const,
        key: `post:${value.id}`,
        created_at: value.created_at,
        value,
      })),
    ...(filter === "All" || filter === "Watchlist" ? selections.filter(s => !superseded.has(s.id)) : []).map(
      (value) => ({
        kind: "selection" as const,
        key: `selection:${value.id}`,
        created_at: value.created_at,
        value,
      }),
    ),
    ...(filter === "All" || filter === "Decision" ? edges : []).map(
      (value) => ({
        kind: "edge" as const,
        key: `edge:${value.official_pick_id}`,
        created_at: value.created_at,
        value,
      }),
    ),
  ];
  return items.sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      b.key.localeCompare(a.key),
  );
}
