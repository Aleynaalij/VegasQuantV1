export const rubyBrands = [
  {
    brand: "The GOAT",
    theme: "diamond",
    monogram: "G",
    tagline: "The standard is different.",
  },
  {
    brand: "OmaticsZone",
    theme: "orbit",
    monogram: "OZ",
    tagline: "Enter the zone.",
  },
  {
    brand: "SoDegenerate",
    theme: "diagonal",
    monogram: "SD",
    tagline: "A different angle.",
  },
  {
    brand: "FranksCorner",
    theme: "corner",
    monogram: "FC",
    tagline: "Straight from the corner.",
  },
  {
    brand: "HoustonMikesHub",
    theme: "skyline",
    monogram: "HM",
    tagline: "The Houston connection.",
  },
] as const;
export type RubyContributor = {
  user_id: string;
  brand: string;
  theme: string;
  active: boolean;
};
export const contributorSports = [
  "Soccer",
  "NFL",
  "NHL",
  "NBA",
  "Baseball",
  "WNBA",
] as const;
export type ContributorSport = (typeof contributorSports)[number];
export type RubySlip = {
  hidden?: boolean;
  reported_result?: string | null;
  revision?: number;
  edited_at?: string | null;
  id: string;
  user_id: string;
  brand: string;
  theme: string;
  submission_day: string;
  sport: ContributorSport;
  title: string;
  legs: string[];
  note: string;
  photo_path: string | null;
  sportsbook: string | null;
  reported_odds: number | null;
  created_at: string;
};
export type RubyFeature = {
  day: string;
  submission_id: string;
  verified_odds: number;
  sportsbook: string;
  source_url: string;
  observed_at: string;
};
export type RubyHomeState = {
  user_id?: string;
  day?: string;
  contributor?: RubyContributor | null;
  submitted?: string | null;
  submission_count?: number;
  due?: {
    id: string;
    brand: string;
    title: string;
    revision: number;
    legs: string[];
    photo_path: string | null;
  }[];
  admin?: boolean;
};
export function rubyLegs(value: string) {
  return value
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
export function rubyOdds(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^[+-]?\d+$/.test(value.trim()))
    throw new Error("Use American odds, for example +450.");
  const n = Number(value);
  if (Math.abs(n) < 100 || Math.abs(n) > 100000)
    throw new Error("Enter valid American odds.");
  return n;
}
export function rubyPrice(n: number) {
  return n > 0 ? `+${n}` : String(n);
}
export function rubyLink(id: string) {
  return `/feed?view=contributors&ruby=${encodeURIComponent(id)}#ruby-${encodeURIComponent(id)}`;
}

export function currentRubyFeature(
  day: string | undefined,
  rows: RubyFeature[] = [],
): RubyFeature | null {
  return day && rows[0]?.day === day ? rows[0] : null;
}

export function contributorTier(theme: string) {
  return theme === "diamond" ? "DIAMOND" : "RUBY";
}
export type CapperRecord = {
  brand: string;
  wins: number;
  losses: number;
  voids: number;
  total: number;
};
/**
 * Ranks cappers from their reported records: most wins first, then fewer losses. Identical
 * records share a rank (1, 2, 2, 4); ties are listed by name.
 */
export function rankCappers(records: CapperRecord[]) {
  const sorted = [...records].sort(
    (a, b) =>
      b.wins - a.wins || a.losses - b.losses || a.brand.localeCompare(b.brand),
  );
  return sorted.map((r) => ({
    ...r,
    pending: Math.max(0, r.total - r.wins - r.losses - r.voids),
    rank:
      1 +
      sorted.filter(
        (o) => o.wins > r.wins || (o.wins === r.wins && o.losses < r.losses),
      ).length,
  }));
}
