import type { CasinoCardData } from "./casino-card";

export function communityParlayCard(
  title: string,
  lines: string[],
  author: string,
  publishedAt: string,
): CasinoCardData {
  return {
    paletteKey: `${author}:${publishedAt}`,
    variant: "parlay",
    eyebrow: "Community parlay · member-created",
    title,
    matchup: `@${author} · ${lines.length} legs`,
    legs: lines.map((line) => {
      const parts =
        /^(.*?)\s+((?:(?:over|under)\s+)?\d+(?:\.\d+)?\+?\s+(?:(?:receiving|rushing|passing)\s+(?:yards|yds)|receptions|catches))$/i.exec(
          line,
        );
      return { name: parts?.[1] || line, market: parts?.[2] || "" };
    }),
    footnote:
      "Member-created combination, not a Vegas Quant recommendation. Every leg must hit. Combined odds unverified.",
    publishedAt,
  };
}
