import { isSport } from "./sports";

export const AUTOMATED_CARD = "vq-publication:v1";
export const PUBLICATION_LABELS = { nfl: "NFL", nba: "NBA", nhl: "NHL", ncaab: "COLLEGE" };
export type PublicationPost = {
  id: string;
  title: string;
  body: string;
  sport: string;
  legs: string[];
  created_at: string;
  card?: string | null;
};
export const isPublicationCard = (p: PublicationPost) =>
  p.card === AUTOMATED_CARD && isSport(p.sport);

// Conservative glyph widths keep URLs, long words and wide characters inside the frame.
export function wrapCardText(
  text: string,
  size: number,
  width = 932,
): string[] {
  const measure = (s: string) =>
    [...s].reduce(
      (n, c) =>
        n +
        size *
          (/\s/.test(c)
            ? 0.3
            : /[ilI.,:;'!|]/.test(c)
              ? 0.35
              : /[MW@%]/.test(c)
                ? 1
                : /[^\x00-\x7f]/.test(c)
                  ? 1.1
                  : 0.7),
      0,
    );
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(line + " " + word) > width) {
        lines.push(line);
        line = "";
      }
      if (line) line += " ";
      for (const c of word) {
        if (measure(line + c) > width) {
          lines.push(line);
          line = "";
        }
        line += c;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function publicationLayout(p: PublicationPost, watchlist = false) {
  const title = wrapCardText(p.title, 60);
  const extra = p.legs.filter((leg) => !p.body.includes(leg));
  const lines = watchlist ? [] : wrapCardText([...extra, p.body].join("\n\n"), 56);
  const start = watchlist ? 454 : 260 + title.length * 72 + 96;
  const height = Math.max(1350, start + Math.max(0, lines.length - 1) * 70 + 170);
  return { title, lines, start, height };
}
export function publicationStamp(at: string) {
  if (!Number.isFinite(Date.parse(at))) return "Publication time unavailable";
  return (
    "Published " +
    new Date(at).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) +
    " ET"
  );
}
export const publicationCopy = (p: PublicationPost) =>
  p.legs.length ? [p.title, ...p.legs].join("\n") : "";

/** Existing early watchers: pair each explicitly stored leg with its concern, without repeating it. */
export function watcherRows(p: PublicationPost) {
  if (
    p.sport !== "nfl" ||
    p.title.toLowerCase() !== "vq early watchers" ||
    !p.legs.length
  )
    return null;
  const parts = p.body.split("\n\n");
  if (
    parts.length !== p.legs.length + 1 ||
    !parts.at(-1)?.startsWith("Watchlist only")
  )
    return null;
  let y = 510;
  const used = new Set<string>();
  const rows = parts.slice(0, -1).map((part) => {
    const [name, ...rest] = part.split("\n");
    const concern = rest.join(" ");
    const matches = p.legs.filter(
      (leg) =>
        leg === name ||
        leg.endsWith(" " + name) ||
        (leg.startsWith(name.split(" ")[0] + " ") &&
          leg.endsWith(name.slice(name.indexOf(" ")))),
    );
    if (
      matches.length !== 1 ||
      used.has(matches[0]) ||
      !concern.startsWith("Concern: ")
    )
      return null;
    used.add(matches[0]);
    const line = wrapCardText(matches[0], 26, 410);
    const risk = wrapCardText(concern.slice(9), 26, 450);
    const row = { line, risk, y };
    y += Math.max(line.length, risk.length) * 34 + 22;
    return row;
  });
  if (rows.some((row) => !row) || y > 1180) return null;
  return rows as { line: string[]; risk: string[]; y: number }[];
}
