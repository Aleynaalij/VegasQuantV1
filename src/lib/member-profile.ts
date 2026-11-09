// Member profile page (Instagram / X style): data shape and small display helpers.

export type ProfilePost = {
  id: string;
  sport: string;
  kind: string;
  title: string;
  body: string;
  photo_path: string | null;
  card: string | null;
  created_at: string;
  reactions: number;
  comments: number;
};

export type MemberProfileData = {
  user_id: string;
  username: string;
  avatar: string | null;
  region: string | null;
  instagram_url: string | null;
  x_url: string | null;
  member_since: string | null;
  is_me: boolean;
  i_follow: boolean;
  followers: number;
  following: number;
  post_count: number;
  posts: ProfilePost[];
};

/** 999 → "999", 1200 → "1.2K", 25000 → "25K", 1500000 → "1.5M". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "Member since Nov 2026" from an ISO date, or "" when unknown. */
export function memberSince(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Member since ${d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}

/** Plain label for a Dealer card post, or null for an ordinary post. */
export function cardLabel(card: string | null): string | null {
  if (!card) return null;
  if (card.startsWith("nfl-wr:")) return "NFL WR matchup card";
  if (card.startsWith("nfl-dvp:")) return "NFL defense vs position card";
  if (card.startsWith("nba-threes:")) return "NBA threes card";
  if (card === "vq-publication:v1") return "Vegas Quant pick";
  return "Card";
}

export function isProfile(x: unknown): x is MemberProfileData {
  const p = x as MemberProfileData;
  return (
    !!p &&
    typeof p.username === "string" &&
    typeof p.followers === "number" &&
    Array.isArray(p.posts)
  );
}

/**
 * "@handle" from a saved Instagram or X profile URL, or null when the URL isn't a plain https profile
 * link on that site (so nothing unexpected is ever rendered as a link).
 */
export function socialHandle(
  url: string | null,
  kind: "instagram" | "x",
): string | null {
  if (!url) return null;
  const m =
    kind === "instagram"
      ? /^https:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/.exec(
          url.trim(),
        )
      : /^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/.exec(
          url.trim(),
        );
  return m ? `@${m[1]}` : null;
}
