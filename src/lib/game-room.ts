import {
  etDay,
  safeSource,
  type Finding,
  type ResearchEvent,
} from "./research-hub";
import { isSport, type Sport } from "./sports";
import type { HubData } from "./research-hub-reader";

export type RoomReference = { sport: Sport; id: string; date: string };
export function roomReference(
  sport: string,
  id: string,
  date = "",
): RoomReference | null {
  if (!isSport(sport) || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null;
  if (
    date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date)
  )
    return null;
  return { sport, id, date };
}
/** Identity, not team names, anchors permanent links. Date is context, never a substitute ID. */
export function gameRoomHref(
  event: Pick<ResearchEvent, "sport" | "id" | "start">,
) {
  const date = etDay(event.start);
  return `/staging/discovery/rooms/${event.sport}/${encodeURIComponent(event.id)}${date ? `?date=${date}` : ""}`;
}
export function resolveRoom(data: HubData, reference: RoomReference) {
  const event = data.events.find(
    (e) => e.sport === reference.sport && e.id === reference.id,
  );
  return {
    event,
    dateChanged:
      !!event && !!reference.date && etDay(event.start) !== reference.date,
    findings:
      event && !data.denied
        ? data.findings.filter((f) => f.eventKey === event.key)
        : [],
  };
}
export function roomSources(findings: Finding[]) {
  return [
    ...new Set(
      findings
        .flatMap((f) => f.sources)
        .map(safeSource)
        .filter((x): x is string => !!x),
    ),
  ];
}
export function roomPublicationHref(value: string | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return null;
  return value;
}
export const ROOM_TOPICS = [
  "overview",
  "injuries",
  "lineups",
  "context",
  "weather",
  "markets",
] as const;
export const ROOM_LABELS: Record<Sport, { context: string; lineup: string }> = {
  nba: { context: "Player & team intelligence", lineup: "Starting lineups" },
  nhl: {
    context: "Goalies, lines & team intelligence",
    lineup: "Line combinations",
  },
  nfl: {
    context: "Usage, matchups & team intelligence",
    lineup: "Depth & participation",
  },
  ncaab: {
    context: "Rotation & team intelligence",
    lineup: "Starting lineups",
  },
};
