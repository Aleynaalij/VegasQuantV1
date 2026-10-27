import type { CasinoCardData } from "./casino-card";

/** Every selection is preserved; large member tickets use readable six-leg pages. */
export function communityParlayCards(
  title: string,
  lines: string[],
  author: string,
  publishedAt: string,
): CasinoCardData[] {
  const pages: CasinoCardData[] = [];
  for (let offset = 0; offset < lines.length; offset += 6) {
    pages.push({
      variant: "parlay",
      eyebrow: "Community parlay · member-created",
      title,
      matchup: `@${author} · ${lines.length} legs${lines.length > 6 ? ` · Card ${pages.length + 1} of ${Math.ceil(lines.length / 6)}` : ""}`,
      legs: lines.slice(offset, offset + 6).map((line) => {
        const parts =
          /^(.*?)\s+((?:(?:over|under)\s+)?\d+(?:\.\d+)?\+?\s+(?:(?:receiving|rushing|passing)\s+(?:yards|yds)|receptions|catches))$/i.exec(
            line,
          );
        return { name: parts?.[1] || line, market: parts?.[2] || "" };
      }),
      footnote:
        "Member-created combination, not a Vegas Quant recommendation. Every leg must hit. Combined odds unverified.",
      publishedAt,
    });
  }
  return pages;
}
