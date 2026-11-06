import { isSport, type Sport } from "./sports";

export const AUTOMATED_CARD = "vq-publication:v1";
export const PUBLICATION_COLORS = {
  nfl: { accent: "#c8decf", glow: "#244b3b", label: "NFL" },
  nba: { accent: "#e7cb82", glow: "#244b3b", label: "NBA" },
  nhl: { accent: "#b7dad5", glow: "#244b3b", label: "NHL" },
  ncaab: { accent: "#d5d8b5", glow: "#244b3b", label: "COLLEGE" },
} satisfies Record<Sport, { accent: string; glow: string; label: string }>;
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
export function publicationPages(p: PublicationPost) {
  const titleLines = wrapCardText(p.title, 60);
  // Bound even unusually long titles, without dropping a word or crowding body/footer text.
  const titles: string[][] = [];
  for (let n = 0; n < titleLines.length; n += 3)
    titles.push(titleLines.slice(n, n + 3));
  const extra = p.legs.filter((l) => !p.body.includes(l));
  const lines = wrapCardText([...extra, p.body].join("\n\n"), 56);
  const pages: { title: string[]; lines: string[]; start: number }[] = [];
  for (const title of titles.slice(0, -1))
    pages.push({ title, lines: [], start: 552 });
  const title = titles.at(-1) || [""];
  const start = 260 + title.length * 72 + 96;
  const capacity = Math.max(1, Math.floor((1180 - start) / 70) + 1);
  for (let n = 0; n < lines.length; n += capacity)
    pages.push({ title, lines: lines.slice(n, n + capacity), start });
  return pages;
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
