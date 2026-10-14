// Groups the live pick releases for Home's "Today" view by kickoff window (Eastern time).
export type TodayLeg = {
  name: string;
  market: string;
  matchup: string;
  odds?: number | null;
  pick_of_day?: boolean;
  fun_play?: boolean;
  parlay?: boolean;
  analysis_kind?: string;
  supersedes_release_id?: string;
};
export type TodayRelease = {
  id: string;
  title: string;
  candidates: TodayLeg[];
  created_at: string;
  expires_at: string;
};
export type TodayWindow = {
  key: string;
  label: string;
  start: string;
  releases: TodayRelease[];
};

const eastern = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: get("minute"),
  };
};

/** Early (before 3 PM ET), late afternoon (3–7 PM ET) or night (7 PM ET and later). */
export function kickoffWindow(iso: string) {
  const t = eastern(iso);
  const slot = t.hour < 15 ? "early" : t.hour < 19 ? "late" : "night";
  const name =
    slot === "early"
      ? "Early games"
      : slot === "late"
        ? "Late afternoon"
        : "Night game";
  return { key: `${t.day}-${slot}`, label: `${t.weekday} · ${name}` };
}

/** Keeps live, forward-looking legs (no recaps, Hail Mary or Pick of the Day duplicates). */
export function todayWindows(
  releases: TodayRelease[],
  now = Date.now(),
): TodayWindow[] {
  const windows = new Map<string, TodayWindow>();
  // A price revision republishes a release; only the newest version is current (as in The Zone).
  const superseded = new Set(
    releases.flatMap((r) =>
      r.candidates.flatMap((c) =>
        c.supersedes_release_id ? [c.supersedes_release_id] : [],
      ),
    ),
  );
  for (const r of [...releases].sort(
    (a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at),
  )) {
    if (!(Date.parse(r.expires_at) > now) || superseded.has(r.id)) continue;
    const legs = r.candidates.filter(
      (c) =>
        !c.pick_of_day &&
        !c.fun_play &&
        !c.parlay &&
        !String(c.analysis_kind || "").startsWith("RETROSPECTIVE"),
    );
    if (!legs.length) continue;
    const w = kickoffWindow(r.expires_at);
    if (!windows.has(w.key))
      windows.set(w.key, { ...w, start: r.expires_at, releases: [] });
    windows.get(w.key)!.releases.push({ ...r, candidates: legs });
  }
  return [...windows.values()];
}

/** "Full game · 60+ receiving yards" -> "60+ receiving yards". */
export const legMarket = (market: string) =>
  market.replace(/^(?:FULL GAME TOTAL|Full game|1st quarter)\s*[·:—-]\s*/i, "");

/** "Buffalo @ Los Angeles Rams · Oct 12 · 8:15 PM ET" -> "Buffalo @ Los Angeles Rams". */
export const legMatchup = (matchup: string) => matchup.split(" · ")[0];
