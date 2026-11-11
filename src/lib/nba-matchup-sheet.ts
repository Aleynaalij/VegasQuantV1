import {
  isPublicationCard,
  type PublicationPost,
} from "./zone-publication-card";

export function nbaMatchupSheetReference(post: PublicationPost) {
  if (
    !isPublicationCard(post) ||
    post.sport !== "nba" ||
    post.legs.length ||
    !post.title.startsWith("NBA Matchup Cheat Sheet · ")
  )
    return null;
  const slug = post.body.match(
    /^https:\/\/vegasquant\.app\/nba\/games\/([a-z0-9]+(?:-[a-z0-9]+)+-\d{8})[ \t]*$/m,
  )?.[1];
  if (slug) return { slug };
  const providerId = post.body.match(
    /^https:\/\/www\.espn\.com\/nba\/game\/_\/gameId\/(\d+)[ \t]*$/m,
  )?.[1];
  return providerId ? { providerId } : null;
}

export function nbaSheetAvailability(body: string) {
  const block = body.match(
    /^AVAILABILITY · NBA ([^\n]+)\n([\s\S]+?)(?=\n\n|$)/m,
  ) ?? body.match(
    /^Injury report \((\d{1,2}:\d{2} (?:AM|PM) ET)\): ([^\n]+)$/m,
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
