import { nbaNickname } from "./nba-home";
import {
  isPublicationCard,
  type PublicationPost,
} from "./zone-publication-card";

export function nbaMatchupSheetSlug(post: PublicationPost) {
  if (
    !isPublicationCard(post) ||
    post.sport !== "nba" ||
    post.legs.length ||
    !post.title.startsWith("NBA Matchup Cheat Sheet · ")
  )
    return null;
  return (
    post.body.match(
      /^https:\/\/vegasquant\.app\/nba\/games\/([a-z0-9]+(?:-[a-z0-9]+)+-\d{8})\s*$/m,
    )?.[1] ?? null
  );
}

export function nbaSheetAvailability(body: string) {
  const block = body.match(
    /^AVAILABILITY · NBA ([^\n]+)\n([\s\S]+?)(?=\n\n|$)/m,
  );
  const url = body.match(
    /^https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}(?:AM|PM)\.pdf$/m,
  )?.[0];
  return block && url ? { label: block[1], text: block[2].trim(), url } : null;
}

export type NbaSheetSource = { label: string; href: string };
export type NbaSheetResponse = {
  title: string;
  svg: string;
  summary: string;
  sources: NbaSheetSource[];
};

/** A cover from the same stored post, without loading protected sheet data. */
export function nbaMatchupPreview(post: PublicationPost) {
  const slug = nbaMatchupSheetSlug(post);
  const codes = slug?.match(/^([a-z]{2,4})-([a-z]{2,4})-\d{8}$/);
  const names = post.title
    .slice("NBA Matchup Cheat Sheet · ".length)
    .split(" @ ");
  const teams =
    slug && names.length === 2 && names.every((name) => name.trim())
      ? names.map((name, i) => ({
          name: name.trim(),
          abbreviation: codes?.[i + 1] ?? null,
        }))
      : null;
  if (!teams) return { teams, tip: null, spread: null, total: null };

  const opening = post.body.split("\n", 1)[0];
  const tip =
    opening.match(
      /^[A-Z][a-z]{2} \d{1,2} · \d{1,2}:\d{2} [AP]M ET(?= · |$)/,
    )?.[0] ?? null;
  const snapshot =
    post.body.match(/^FANDUEL SNAPSHOTS\n([^\n]+\n[^\n]+)/m)?.[1] ?? "";
  const observedSpread = snapshot.match(
    /^Spread · (.+) · (\d{1,2}:\d{2} [AP]M ET)$/m,
  );
  const observedTotal = snapshot.match(
    /^Total · Over (\d+(?:\.\d+)?) \([+-]\d+\) \| Under \1 \([+-]\d+\) · (\d{1,2}:\d{2} [AP]M ET)$/m,
  );
  const sides = new Map<string, string>();
  for (const entry of observedSpread?.[1].split(" | ") ?? []) {
    const side = entry.match(/^(.+) ([+-]\d+(?:\.\d+)?) \([+-]\d+\)$/);
    if (side) sides.set(side[1], side[2]);
  }
  const spread =
    observedSpread &&
    sides.size === 2 &&
    teams.every((team) => sides.has(team.name))
      ? {
          value: teams
            .map((team) => {
              const label =
                team.abbreviation?.toUpperCase() ?? nbaNickname(team.name);
              return `${label} ${sides.get(team.name)}`;
            })
            .join(" / "),
          observed: observedSpread[2],
        }
      : null;
  return {
    teams,
    tip,
    spread,
    total: observedTotal
      ? { value: observedTotal[1], observed: observedTotal[2] }
      : null,
  };
}
