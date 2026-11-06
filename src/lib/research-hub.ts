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
  return events.filter((e) => {
    const own = findings.filter((x) => x.eventKey === e.key);
    return (
      (f.sport === "all" || e.sport === f.sport) &&
      (!f.date || etDay(e.start) === f.date) &&
      (f.topic === "all" ||
        own.some((x) => x.topic === f.topic) ||
        (f.topic === "lineups" && (e.sport === "nba" || e.sport === "nhl")) ||
        (f.topic === "weather" && e.sport === "nfl") ||
        own.length === 0) &&
      (!q ||
        `${e.away} ${e.home} ${e.venue || ""} ${own.map((x) => `${x.title} ${x.text}`).join(" ")}`
          .toLocaleLowerCase()
          .includes(q))
    );
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
