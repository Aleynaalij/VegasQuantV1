// Plain-language activity for the admin member portal.
export type Activity = { label: string; tone: "live" | "recent" | "idle" | "never" };
const H = 3600000,
  D = 24 * H;

/** "Active 2h ago" / "Active 3 days ago" / "Idle 12 days" / "Never logged in". */
export function activity(lastActive: string | null, now = Date.now()): Activity {
  const t = lastActive ? Date.parse(lastActive) : NaN;
  if (!Number.isFinite(t)) return { label: "Never logged in", tone: "never" };
  const ago = Math.max(0, now - t);
  if (ago < H) return { label: "Active in the last hour", tone: "live" };
  if (ago < D) return { label: `Active ${Math.floor(ago / H)}h ago`, tone: "live" };
  const days = Math.floor(ago / D);
  if (ago < 7 * D) return { label: `Active ${days} day${days === 1 ? "" : "s"} ago`, tone: "recent" };
  return { label: `Idle ${days} days`, tone: "idle" };
}

export type MemberSort = "active" | "newest" | "idle";
/** Most recently active first, newest sign-ups first, or longest idle (never-logged-in first). */
export function sortMembers<T extends { last_active: string | null; created_at: string }>(
  rows: T[],
  by: MemberSort,
) {
  const seen = (r: T) => (r.last_active ? Date.parse(r.last_active) : -Infinity);
  return [...rows].sort((a, b) =>
    by === "newest"
      ? Date.parse(b.created_at) - Date.parse(a.created_at)
      : by === "idle"
        ? seen(a) - seen(b)
        : seen(b) - seen(a),
  );
}
