import type { NhlTeamReport, NhlSource } from "./nhl-context";
export type NhlChartSample = {
  id: number;
  name: string;
  date: string;
  game_id: string;
  opponent: string;
  position: string;
  shots: number | null;
  goals: number | null;
  points: number | null;
  blocks: number | null;
  seconds: number;
  shifts: number | null;
};
export type NhlChartTeam = NhlTeamReport & {
  samples: NhlChartSample[];
  chart_boxes_verified: number;
};
export type NhlChartSnapshot = {
  version: 1;
  id: string;
  game_id: string;
  day: string;
  collected_at: string;
  nhl_url: string;
  teams: [NhlChartTeam, NhlChartTeam];
  sources: NhlSource[];
  gaps: string[];
  game: {
    start_time: string;
    away: { name: string; short_name: string };
    home: { name: string; short_name: string };
  };
};
export const nhlChartRef = (card: string | null | undefined) =>
  /^nhl-charts:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    card || "",
  )?.[1] || null;
export function isNhlChart(x: unknown): x is NhlChartSnapshot {
  const s = x as NhlChartSnapshot;
  return (
    !!s &&
    s.version === 1 &&
    typeof s.id === "string" &&
    typeof s.collected_at === "string" &&
    Array.isArray(s.teams) &&
    s.teams.length === 2 &&
    s.teams.every((t) => Array.isArray(t.samples) && Array.isArray(t.games)) &&
    Array.isArray(s.sources)
  );
}
export const nhlStamp = (s: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(s)) + " ET";
export function chartPlayers(t: NhlChartTeam, defense = false) {
  const ids = [
    ...new Set(
      t.samples
        .filter((s) => s.seconds > 0 && (!defense || s.position === "D"))
        .map((s) => s.id),
    ),
  ];
  return ids
    .map((id) => {
      const samples = t.samples
        .filter((s) => s.id === id && s.seconds > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      const latest = samples.at(-1)!;
      const sum = (key: "shots" | "goals" | "points" | "blocks") =>
        samples.every((s) => s[key] !== null)
          ? samples.reduce((n, s) => n + s[key]!, 0)
          : null;
      const seconds = samples.reduce((n, s) => n + s.seconds, 0),
        blocks = sum("blocks");
      return {
        id,
        name: latest.name,
        position: latest.position,
        samples,
        shots: sum("shots"),
        goals: sum("goals"),
        points: sum("points"),
        blocksPer60:
          blocks !== null && seconds > 0 ? (blocks * 3600) / seconds : null,
        minutes: seconds / 60 / samples.length,
      };
    })
    .sort((a, b) =>
      defense
        ? (b.blocksPer60 ?? -1) - (a.blocksPer60 ?? -1)
        : (b.shots ?? -1) - (a.shots ?? -1),
    );
}
/** Calendar dates between games, not elapsed hours of recovery or verified travel. */
export function restDays(day: string, last: string | undefined): number | null {
  if (!last) return null;
  const d =
    (Date.parse(day + "T12:00:00Z") - Date.parse(last + "T12:00:00Z")) /
    86400000;
  return Number.isFinite(d) && d >= 1 ? Math.max(0, d - 1) : null;
}

/** Avoid ranking a single short appearance as a meaningful defensive rate. */
export function blockChartPlayers(t: NhlChartTeam) {
  return chartPlayers(t, true).filter(
    (p) =>
      p.samples.length >= 3 &&
      p.minutes * p.samples.length >= 30 &&
      p.blocksPer60 !== null,
  );
}
