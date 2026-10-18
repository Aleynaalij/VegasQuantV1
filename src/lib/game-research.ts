import type { Analysis } from "./domain";
export type ResearchItem = {
  heading: string;
  text: string;
  version: number;
  at: string;
  sources: string[];
};
export type ResearchTopic = {
  id: string;
  label: string;
  items: ResearchItem[];
};
const operational =
  /\b(SHADOW_ONLY|R[1-8]|scanner|scanned|approved priced model|approved model|model registry|v0\.\d|hosted (?:journal|forecast|records)|input hashes|coverage journal|forecast rows|Research Board.*tier|preserv.*(?:tickets|bankroll)|publication gate)\b/i;
/** Hide operational sentences, not football facts or the original stored evidence. */
export function memberResearchText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replaceAll("\\n", "\n")
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+(?=[A-Z])/u)
        .filter((s) => !operational.test(s))
        .join(" "),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}
export function publicationSources(a: Analysis): string[] {
  const urls =
    ((a.sections.Sources || "") + " " + a.source).match(
      /https:\/\/[^\s\\<>]+/g,
    ) || [];
  return [
    ...new Set(
      urls.flatMap((value) => {
        try {
          const url = new URL(value.replace(/[),.;]+$/, ""));
          return url.protocol === "https:" && url.hostname ? [url.href] : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

const topics = [
  [
    "overview",
    "Overview",
    ["Game Summary", "Role update", "Role change", "Case and failure path"],
  ],
  ["form", "Team form", ["Team form"]],
  [
    "matchup",
    "Matchup",
    [
      "Defensive Matchups",
      "Team Strength",
      "QB Analysis",
      "Offensive Line",
      "Role update",
      "Role change",
    ],
  ],
  ["players", "Players & workload", ["Workload facts"]],
  ["injuries", "Injuries", ["Injuries", "Availability"]],
  ["weather", "Weather", ["Weather"]],
  ["market", "Market context", ["Market", "Public vs Sharp"]],
] as const;
/** Topics retain actual publication dates. A weather update cannot erase the matchup;
 * a historical view cannot inherit newer facts. Never inherit targets/projections. */
export function gameResearchTopics(
  versions: Analysis[],
  through: number,
): ResearchTopic[] {
  const history = versions
    .filter((a) => a.version <= through)
    .sort((a, b) => b.version - a.version);
  return topics
    .map(([id, label, keys]) => {
      const items: ResearchItem[] = [];
      const item = (a: Analysis, heading: string): ResearchItem | null => {
        const raw = a.sections[heading];
        if (
          heading === "Game Summary" &&
          /^[\s\S]*?·\s*\d{4}-\d\d-\d\dT\S+\.\s*Material pregame research update observed \S+\.?$/i.test(
            String(raw),
          )
        )
          return null;
        const text = memberResearchText(raw);
        let origin = a;
        if (text) {
          for (const earlier of history.filter((v) => v.version < a.version)) {
            const prior = memberResearchText(earlier.sections[heading]);
            if (!prior) continue;
            if (prior !== text) break;
            origin = earlier;
          }
        }
        return text
          ? {
              heading,
              text,
              version: origin.version,
              at: origin.created_at,
              sources: publicationSources(origin),
            }
          : null;
      };
      if (id === "overview" || id === "injuries") {
        const primaryKeys = keys.filter((k) => k !== "Case and failure path");
        const latest = history
          .flatMap((a) =>
            primaryKeys
              .map((k) => item(a, k))
              .filter((v): v is ResearchItem => !!v),
          )
          .sort((a, b) => b.version - a.version)[0];
        const fallback =
          id === "overview"
            ? history.map((a) => item(a, "Case and failure path")).find(Boolean)
            : null;
        if (latest || fallback) items.push((latest || fallback)!);
      } else {
        for (const heading of keys) {
          const latest = history.map((a) => item(a, heading)).find(Boolean);
          if (latest && !items.some((i) => i.text === latest.text))
            items.push(latest);
        }
      }
      if (id === "overview") {
        const form = history.find((a) =>
          memberResearchText(a.sections["Team form"]),
        );
        if (form)
          items.push({ ...item(form, "Team form")!, heading: "Season so far" });
      }
      return { id, label, items };
    })
    .filter((t) => t.items.length);
}
export type GameNewsRow = {
  id: string;
  title: string;
  summary: string;
  why_watch: string;
  caution: string;
  source_url: string;
  source_at: string;
  created_at: string;
};
export function footballNews(rows: GameNewsRow[]): GameNewsRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (
      /^(?:Sunday|Full.slate).*(?:coverage|props now visible)|^Coverage\b|scanner|feed run|model validation/i.test(
        r.title,
      ) ||
      /\/research\/probability\//.test(r.source_url)
    )
      return false;
    const key = r.title + "|" + r.summary;
    if (seen.has(key)) return false;
    seen.add(key);
    return !!memberResearchText(r.summary);
  });
}
