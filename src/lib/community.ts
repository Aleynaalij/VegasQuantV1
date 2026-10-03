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
