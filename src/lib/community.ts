export const regions = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West Coast",
  "Mountain West",
  "Outside the US",
];
export type CommunityProfile = {
  username: string;
  region: string;
  avatar: string | null;
  visible: boolean;
  instagram_url?: string | null;
  x_url?: string | null;
};
export type CommunityMember = CommunityProfile & {
  joined_at: string;
  followed: number;
  last_checkin: string | null;
};
export function runMilestone(wins: number[], open: boolean, losses: boolean) {
  if (new Set(wins).size === 5) return "CHALLENGE COMPLETED";
  if (open) return "IN PLAY";
  if (losses) return "RUN REVIEW";
  if (wins.length) return "LEG WON";
  return "FOLLOWING";
}

export function socialUrl(
  value: string,
  kind: "instagram" | "x",
): string | null {
  if (!value.trim()) return null;
  const expression =
    kind === "instagram"
      ? /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]{1,30}\/?$/
      : /^https:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/;
  if (!expression.test(value.trim()))
    throw new Error(
      `Enter a full HTTPS ${kind === "instagram" ? "Instagram" : "X"} profile URL without query parameters.`,
    );
  return value.trim();
}
