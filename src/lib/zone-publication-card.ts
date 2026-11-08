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
type PublicationRow = {
  text: string;
  x: number;
  y: number;
  pick?: boolean;
  size?: number;
};

function editorialExcerpt(text: string, max: number) {
  const firstSentence = text.split(/(?<=[.!?])\s+/, 1)[0];
  if (firstSentence.length <= max) return firstSentence;
  const end = text.lastIndexOf(" ", max - 1);
  return text.slice(0, end > 0 ? end : max - 1) + "…";
}

/** Recognize the existing single-pick NBA publisher's exact body structure. */
function editorialSections(p: PublicationPost) {
  if (p.sport !== "nba" || p.legs.length > 1 || !isPublicationCard(p)) return null;
  const [line, why, risk, unknowns, disclosure] = p.body.split("\n\n");
  if (!line?.startsWith(p.title + " (") || !why || !risk?.startsWith("Risk: ") ||
      !unknowns?.startsWith("Unknowns: ") ||
      !disclosure?.startsWith("Qualitative editorial, not a validated model edge.")) return null;
  const quote = /^([+-]\d+ at FanDuel), observed (.+ ET)\)$/.exec(line.slice(p.title.length + 2));
  if (!quote) return null;
  return {
    price: quote[1],
    observed: quote[2],
    why: editorialExcerpt(why, 92),
    risk: editorialExcerpt(risk.slice(6), 88),
  };
}

export function publicationLayout(p: PublicationPost, watchlist = false) {
  const title = wrapCardText(p.title, 60);
  const start = watchlist ? 454 : 260 + title.length * 72 + 96;
  const rows: PublicationRow[] = [];
  if (watchlist) return { title, rows, start, height: 1350 };

  const step = 61;
  const columnWidth = 452;
  const columns = [74, 554];
  const editorial = editorialSections(p);
  if (editorial) {
    rows.push({ text: editorial.price, x: 74, y: start, size: 50, pick: true });
    rows.push({ text: `Observed ${editorial.observed}`, x: 74, y: start + 54, size: 38 });
    const sections = [
      { label: "WHY THIS PICK", text: editorial.why },
      { label: "KEY RISK", text: editorial.risk },
    ];
    const first = start + 160;
    sections.forEach(({ label, text }, i) => {
      rows.push({ text: label, x: columns[i], y: first - 54, size: 32, pick: true });
      wrapCardText(text, 48, columnWidth).forEach((line, n) => {
        rows.push({ text: line, x: columns[i], y: first + n * 56, size: 48 });
      });
    });
    return { title, rows, start, height: Math.max(920, Math.max(...rows.map((row) => row.y)) + 150), editorial: true };
  }
  let bodyStart = start;
  let body = p.body;
  if (p.legs.length > 1) {
    const split = Math.ceil(p.legs.length / 2);
    const sides = [p.legs.slice(0, split), p.legs.slice(split)];
    const ends = sides.map((legs, column) => {
      let y = start;
      legs.forEach((leg, i) => {
        const index = column * split + i + 1;
        for (const text of wrapCardText(`${index}. ${leg}`, 56, columnWidth)) {
          rows.push({ text, x: columns[column], y, pick: true });
          y += step;
        }
        y += 16;
      });
      return y;
    });
    bodyStart = Math.max(...ends) + 20;
    const legs = new Set(p.legs);
    body = body.split("\n").filter((line) => !legs.has(line.trim())).join("\n").trim();
  } else {
    const extra = p.legs.filter((leg) => !body.includes(leg));
    body = [...extra, body].filter(Boolean).join("\n\n");
  }

  const single = body ? wrapCardText(body, 56) : [];
  const narrow = single.length > 6 ? wrapCardText(body, 56, columnWidth) : [];
  const midpoint = Math.ceil(narrow.length / 2);
  // Prefer a paragraph break near the midpoint without making either side much taller.
  const boundaries = narrow.flatMap((line, i) =>
    !line && Math.abs(i - midpoint) <= 2 ? [i] : [],
  );
  const split = boundaries.reduce(
    (best, index) => Math.abs(index - midpoint) < Math.abs(best - midpoint) ? index : best,
    boundaries[0] ?? midpoint,
  );
  const bodyColumns = narrow.length
    ? [narrow.slice(0, split), narrow.slice(split)]
    : [single];
  bodyColumns.forEach((lines, column) => {
    const first = lines.findIndex(Boolean);
    if (first < 0) return;
    lines.slice(first).forEach((text, i) => {
      if (text) rows.push({ text, x: columns[column], y: bodyStart + i * step });
    });
  });
  const bottom = rows.reduce((last, row) => Math.max(last, row.y), start);
  return { title, rows, start, height: Math.max(920, bottom + 170) };
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
