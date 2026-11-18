import type { HubData } from "./research-hub-reader";
import type { Finding, ResearchEvent } from "./research-hub";
import { tonightGames, type TonightGame } from "./vq-tonight";
import { gameRoomHref, roomReference } from "./game-room";
import type { Sport } from "./sports";

/** A chronological selection, never a claim of personalized ranking or Dealer authorship. */
export function homeResearch(
  data: HubData | null,
  sport: Sport | "all",
  limit = 6,
): { finding: Finding; event: ResearchEvent }[] {
  if (!data || data.denied || !data.signedIn) return [];
  const events = new Map(data.events.map((event) => [event.key, event]));
  return data.findings
    .flatMap((finding) => {
      const event = events.get(finding.eventKey);
      return event && (sport === "all" || event.sport === sport)
        ? [{ finding, event }]
        : [];
    })
    .sort((a, b) => {
      const date = (value: string | null) =>
        Number.isFinite(Date.parse(value || "")) ? Date.parse(value!) : 0;
      return (
        date(b.finding.recordedAt) - date(a.finding.recordedAt) ||
        a.finding.id.localeCompare(b.finding.id)
      );
    })
    .slice(0, Math.max(0, limit));
}
export const HOME_TOOLS = [
  {
    href: "/parlays",
    title: "My Lays",
    detail: "Your saved lays and leg library",
  },
  {
    href: "/parlays?build=1",
    title: "Build a Lay",
    detail: "Explore supported legs. No wager is placed.",
  },
  {
    href: "/saved",
    title: "Saved picks",
    detail: "Revisit your account’s saved selections",
  },
  {
    href: "/slots",
    title: "VQ Slots",
    detail: "Open the existing entertainment experience",
  },
  {
    href: "/vegas-fear",
    title: "Fear Index",
    detail: "NFL and NBA · access rules apply",
  },
] as const;
export function homeTimestamp(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time not supplied";
  return (
    new Date(value).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

/** Combined-only schedule projection from the same guarded read as research.
 * Preserve stored identity/time/status; never infer a schedule from a finding or team name.
 */
export function stageHomeGames(
  data: HubData | null,
  now: number,
): TonightGame[] {
  if (!data?.signedIn || data.denied) return [];
  return tonightGames(
    data.events.flatMap((event) => {
      if (
        !roomReference(event.sport, event.id) ||
        !event.away ||
        !event.home ||
        !Number.isFinite(Date.parse(event.start))
      )
        return [];
      return [
        {
          sport: event.sport,
          id: event.id,
          away: event.away,
          home: event.home,
          start: event.start,
          tbd: event.tbd,
          status: event.status,
          href: gameRoomHref(event),
        },
      ];
    }),
    now,
  );
}
