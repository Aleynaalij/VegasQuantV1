import { isSport } from "./sports";

export const AUTOMATED_CARD = "vq-publication:v1";
export const PUBLICATION_LABELS = {
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  ncaab: "COLLEGE",
};
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
  weight?: number;
  tone?: "accent" | "muted";
};
type PublicationLayout = {
  title: string[];
  start: number;
  rows: PublicationRow[];
  height: number;
  editorial?: boolean;
  research?: boolean;
  rules?: number[];
  headline?: string;
};

/** A face is a preview, never the storage format for the report. Keep the full
 * title/body in the accessible disclosure; do not let prose or URLs size an image. */
function previewLines(text: string, size: number, limit: number, width = 932) {
  const lines = wrapCardText(text, size, width);
  if (lines.length <= limit) return lines;
  const kept = lines.slice(0, limit);
  kept[limit - 1] = kept[limit - 1].replace(/\s+\S*$/, "").trimEnd() + "…";
  // A single unbroken word can consume the entire last line.
  while (wrapCardText(kept[limit - 1], size, width).length > 1) {
    const characters = [...kept[limit - 1]];
    characters.splice(-2, 1);
    kept[limit - 1] = characters.join("");
  }
  return kept;
}

/** Read only the publisher's explicit receiving-yard snapshot format. If a
 * quote or its time cannot be preserved, use the ordinary report preview. */
function receivingSnapshots(p: PublicationPost) {
  if (p.sport !== "nfl" || !/^NFL WR Matchups · /.test(p.title)) return null;
  if (
    wrapCardText(
      p.title.replace(/^NFL WR Matchups · /, "").replace(" @ ", "\n@ "),
      60,
    ).length > 2
  )
    return null;
  const observed = p.body.match(
    /FanDuel receiving[\s‑-]yard snapshots at [^\n]+? ET\./,
  )?.[0];
  if (!observed || wrapCardText(observed, 38).length > 2) return null;
  let team = "";
  const entries: {
    name: string;
    team: string;
    line: string;
    over: string;
    under: string;
  }[] = [];
  for (const line of p.body.split("\n")) {
    if (/^[A-Z]{2,4}$/.test(line.trim())) team = line.trim();
    if (!/rec yds/.test(line)) continue;
    if (line.match(/rec yds/g)?.length !== 1) return null;
    const quote =
      /^([^:\n]+): (\d+(?:\.\d+)?) rec yds \(O ([+−-]\d+), U ([+−-]\d+)\)\.(?:\s|$)/.exec(
        line,
      );
    if (
      !quote ||
      !team ||
      wrapCardText(quote[1], 48, 650).length > 1 ||
      wrapCardText(quote[2], 56, 186).length > 1 ||
      wrapCardText(`${team} · O ${quote[3]} / U ${quote[4]}`, 34).length > 1
    )
      return null;
    entries.push({
      name: quote[1],
      team,
      line: quote[2],
      over: quote[3],
      under: quote[4],
    });
  }
  if (
    !entries.length ||
    entries.length > 5 ||
    new Set(entries.map((e) => e.name)).size !== entries.length
  )
    return null;
  return { observed, entries };
}

function researchLayout(p: PublicationPost) {
  const snapshots = receivingSnapshots(p);
  const title = previewLines(
    snapshots
      ? p.title.replace(/^NFL WR Matchups · /, "").replace(" @ ", "\n@ ")
      : p.title,
    60,
    3,
  );
  const start = 260 + title.length * 72 + 96;
  const rows: PublicationRow[] = [];
  const rules: number[] = [];
  if (snapshots) {
    wrapCardText(snapshots.observed, 38).forEach((text, i) =>
      rows.push({ text, x: 74, y: start + i * 44, size: 38, tone: "muted" }),
    );
    rows.push({
      text: "PLAYER / OVER · UNDER",
      x: 74,
      y: start + 108,
      size: 30,
      tone: "accent",
      weight: 700,
    });
    rows.push({
      text: "REC YDS",
      x: 800,
      y: start + 108,
      size: 30,
      tone: "accent",
      weight: 700,
    });
    snapshots.entries.forEach((entry, i) => {
      const y = start + 172 + i * 96;
      rows.push({ text: entry.name, x: 74, y, size: 48, weight: 700 });
      rows.push({
        text: entry.line,
        x: 820,
        y,
        size: 56,
        weight: 700,
        pick: true,
      });
      rows.push({
        text: `${entry.team} · O ${entry.over} / U ${entry.under}`,
        x: 74,
        y: y + 38,
        size: 34,
        tone: "muted",
      });
      if (i < snapshots.entries.length - 1) rules.push(y + 50);
    });
  } else {
    // URLs belong in the report, not a second column on the preview image.
    const prose = p.body
      .split("\n")
      .filter((line) => !/https?:\/\/|^\s*sources?\s*:?[ \t]*$/i.test(line))
      .join("\n")
      .trim();
    rows.push({
      text: "REPORT EXCERPT",
      x: 74,
      y: start,
      size: 30,
      tone: "accent",
      weight: 700,
    });
    previewLines(
      prose || "Open the full report for analysis and source links.",
      50,
      8,
    ).forEach((text, i) =>
      rows.push({ text, x: 74, y: start + 66 + i * 61, size: 50 }),
    );
  }
  return {
    title,
    start,
    rows,
    height: 1350,
    research: true,
    rules,
    headline: snapshots ? "WR MATCHUPS" : "RESEARCH UPDATE",
  };
}

/** Recognize the existing single-pick NBA publisher's exact quote format. */
function editorialQuote(p: PublicationPost) {
  if (p.sport !== "nba" || p.legs.length > 1 || !isPublicationCard(p))
    return null;
  const [line, why, risk, unknowns, disclosure] = p.body.split("\n\n");
  if (
    !line?.startsWith(p.title + " (") ||
    !why ||
    !risk?.startsWith("Risk: ") ||
    !unknowns?.startsWith("Unknowns: ") ||
    !disclosure?.startsWith(
      "Qualitative editorial, not a validated model edge.",
    )
  )
    return null;
  return /^([+-]\d+ at FanDuel), observed (.+ ET)\)$/.exec(
    line.slice(p.title.length + 2),
  );
}

export function publicationLayout(
  p: PublicationPost,
  watchlist = false,
): PublicationLayout {
  if (!watchlist && !p.legs.length && !editorialQuote(p))
    return researchLayout(p);
  const title = wrapCardText(p.title, 60);
  const start = watchlist ? 454 : 260 + title.length * 72 + 96;
  const rows: PublicationRow[] = [];
  if (watchlist) return { title, rows, start, height: 1350 };

  const step = 61;
  const columnWidth = 452;
  const columns = [74, 554];
  const quote = editorialQuote(p);
  const editorial = Boolean(quote);
  if (quote) {
    rows.push({ text: quote[1], x: 74, y: start, pick: true });
    wrapCardText(`Observed ${quote[2]}`, 38).forEach((text, i) =>
      rows.push({ text, x: 74, y: start + 54 + i * 44, size: 38 }),
    );
  } else if (p.legs.length === 1) {
    const [leg] = p.legs;
    if (leg !== p.title) {
      wrapCardText(leg, 56).forEach((text, i) =>
        rows.push({ text, x: 74, y: start + i * step, pick: true }),
      );
    }
  } else if (p.legs.length > 1) {
    const split = Math.ceil(p.legs.length / 2);
    const sides = [p.legs.slice(0, split), p.legs.slice(split)];
    sides.forEach((legs, column) => {
      let y = start;
      legs.forEach((leg, i) => {
        const index = column * split + i + 1;
        for (const text of wrapCardText(`${index}. ${leg}`, 56, columnWidth)) {
          rows.push({ text, x: columns[column], y, pick: true });
          y += step;
        }
        y += 16;
      });
    });
  }
  if (editorial || p.legs.length) {
    const bottom = rows.reduce((last, row) => Math.max(last, row.y), start);
    return {
      title,
      rows,
      start,
      height: Math.max(670, bottom + 170),
      editorial,
    };
  }

  return { title, rows, start, height: 1350 };
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
