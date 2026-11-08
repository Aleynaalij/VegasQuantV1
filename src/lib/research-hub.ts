import { isSport, type Sport } from "./sports";
export const TOPICS = [
  "all",
  "overview",
  "injuries",
  "lineups",
  "weather",
  "context",
  "markets",
] as const;
export type Topic = (typeof TOPICS)[number];
export const TOPIC_NAMES: Record<Topic, string> = {
  all: "All research",
  overview: "Overview",
  injuries: "Injuries",
  lineups: "Lineups",
  weather: "Weather",
  context: "Team & player context",
  markets: "Market observations",
};
export type ResearchEvent = {
  key: string;
  id: string;
  sport: Sport;
  slug: string;
  away: string;
  home: string;
  start: string;
  tbd: boolean;
  venue: string | null;
  status: string;
  source: string | null;
  scheduleAt: string | null;
  roof?: string;
  awayAbbreviation?: string;
  homeAbbreviation?: string;
};
export type Finding = {
  publicationHref?: string;
  id: string;
  eventKey: string;
  topic: Exclude<Topic, "all">;
  title: string;
  text: string;
  sources: string[];
  sourceAt: string | null;
  recordedAt: string | null;
  label: "Published research" | "Provider report" | "Observed quote";
};
export type HubFilters = {
  sport: Sport | "all";
  topic: Topic;
  date: string;
  query: string;
  event: string;
};
export function hubFilters(params: Pick<URLSearchParams, "get">): HubFilters {
  const sport = params.get("sport"),
    topic = params.get("topic");
  return {
    sport: isSport(sport) ? sport : "all",
    topic: TOPICS.includes(topic as Topic) ? (topic as Topic) : "all",
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
      ? params.get("date")!
      : "",
    query: (params.get("q") || "").slice(0, 100),
    event: (params.get("event") || "").slice(0, 100),
  };
}
export function hubHref(filters: HubFilters, patch: Partial<HubFilters> = {}) {
  const f = { ...filters, ...patch },
    p = new URLSearchParams();
  if (f.sport !== "all") p.set("sport", f.sport);
  if (f.topic !== "all") p.set("topic", f.topic);
  if (f.date) p.set("date", f.date);
  if (f.query) p.set("q", f.query);
  if (f.event) p.set("event", f.event);
  return `/research${p.size ? `?${p}` : ""}`;
}
export const etDay = (at: string) => {
  const d = new Date(at);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d)
    : "";
};
export function safeSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function sourceAge(
  at: string | null,
  now = Date.now(),
  maxAge = 60 * 60_000,
) {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t) || t > now) return "Source time unknown";
  return now - t > maxAge ? "Older source snapshot" : "Recent source snapshot";
}
export function filterEvents(
  events: ResearchEvent[],
  findings: Finding[],
  f: HubFilters,
) {
  const q = f.query.trim().toLocaleLowerCase();
  const covered = (e: ResearchEvent) =>
    f.topic !== "all" &&
    findings.some((x) => x.eventKey === e.key && x.topic === f.topic);
  const kept = events.filter((e) => {
    const own = findings.filter((x) => x.eventKey === e.key);
    return (
      (f.sport === "all" || e.sport === f.sport) &&
      (!f.date || etDay(e.start) === f.date) &&
      // Topic scopes dossier content and coverage badges; missing reports never hide an event.
      (!q ||
        `${e.away} ${e.home} ${e.venue || ""} ${own.map((x) => `${x.title} ${x.text}`).join(" ")}`
          .toLocaleLowerCase()
          .includes(q))
    );
  });
  // A chosen topic never hides an event, but events with that topic's reports come first (stable, so
  // kickoff order is kept within each group).
  return f.topic === "all"
    ? kept
    : [...kept.filter(covered), ...kept.filter((e) => !covered(e))];
}
export type SearchHit = {
  key: string;
  event: ResearchEvent;
  /** The dossier section that holds the match; null for a team-name match. */
  topic: Exclude<Topic, "all"> | null;
  /** The exact line that matched (a team pairing, or one line of a report). */
  line: string;
};
/**
 * What a search actually matched, line by line, so the reader sees "Justin Jefferson: Questionable
 * (Injuries)" instead of an unexplained game. Same sport/date scope as the list; team matches first,
 * then report lines, each group in kickoff order.
 */
export function searchHits(
  events: ResearchEvent[],
  findings: Finding[],
  f: HubFilters,
): SearchHit[] {
  const q = f.query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const has = (s: string) => s.toLocaleLowerCase().includes(q);
  const teams: SearchHit[] = [],
    lines: SearchHit[] = [];
  for (const e of events) {
    if (f.sport !== "all" && e.sport !== f.sport) continue;
    if (f.date && etDay(e.start) !== f.date) continue;
    if (has(e.away) || has(e.home))
      teams.push({
        key: `${e.key}|team`,
        event: e,
        topic: null,
        line: `${e.away} at ${e.home}`,
      });
    const seen = new Set<string>();
    for (const x of findings) {
      if (x.eventKey !== e.key) continue;
      for (const raw of [x.title, ...x.text.split("\n")]) {
        const line = raw.trim();
        if (!line || !has(line) || seen.has(line)) continue;
        seen.add(line);
        lines.push({
          key: `${e.key}|${x.id}|${line}`,
          event: e,
          topic: x.topic,
          line: line.length > 140 ? line.slice(0, 137) + "…" : line,
        });
      }
    }
  }
  return [...teams, ...lines];
}
/** Source notices for the sport in view; notices that name no sport always show. */
export function sportErrors(errors: string[], sport: HubFilters["sport"]) {
  if (sport === "all") return errors;
  return errors.filter((e) => {
    // A notice belongs to a sport when it names one anywhere (e.g. "Some NFL research sources…").
    const named = (e.match(/\b(NFL|NBA|NHL|NCAAB)\b/g) || []).map((s) =>
      s.toLowerCase(),
    );
    return !named.length || named.includes(sport);
  });
}
export function eventFinding(
  e: ResearchEvent,
  row: { game_id: string; sport?: string },
  item: Omit<Finding, "eventKey">,
): Finding | null {
  return row.game_id === e.id && (!row.sport || row.sport === e.sport)
    ? { ...item, eventKey: e.key }
    : null;
}
export function eventHref(e: ResearchEvent) {
  return e.sport === "nfl"
    ? `/matchups/${encodeURIComponent(e.slug)}`
    : `/${e.sport}/games/${encodeURIComponent(e.slug)}`;
}
