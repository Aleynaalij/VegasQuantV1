/** The sports Vegas Quant covers (#166). Canonical app keys; provider keys stay at ingestion. */
export type Sport = "nfl" | "nba" | "nhl" | "ncaab";

export type SportInfo = {
  key: Sport;
  /** Chip and badge text. */
  label: string;
  /** Full name for headings and screen readers. */
  name: string;
  /** Where the sport's Home lives. */
  home: string;
  /** "Next kickoff" / "Next tip-off" / "Next puck drop". */
  next: string;
  /** Countdown label. */
  countdown: string;
  /** Countdown text once the game starts. */
  started: string;
  /** Members see this sport's chip, Home and Zone filter. Off until its data and screens ship. */
  live: boolean;
};

export const SPORTS: Record<Sport, SportInfo> = {
  nfl: {
    key: "nfl",
    label: "NFL",
    name: "NFL",
    home: "/",
    next: "Next kickoff",
    countdown: "Time to kickoff",
    started: "Kicked off",
    live: true,
  },
  nba: {
    key: "nba",
    label: "NBA",
    name: "NBA",
    home: "/nba",
    next: "Next tip-off",
    countdown: "Time to tip-off",
    started: "Tipped off",
    live: true,
  },
  nhl: {
    key: "nhl",
    label: "NHL",
    name: "NHL",
    home: "/nhl",
    next: "Next puck drop",
    countdown: "Time to puck drop",
    started: "Puck dropped",
    live: true,
  },
  ncaab: {
    key: "ncaab",
    label: "NCAAB",
    name: "College basketball",
    home: "/ncaab",
    next: "Next tip-off",
    countdown: "Time to tip-off",
    started: "Tipped off",
    live: true,
  },
};

export const SPORT_ORDER: Sport[] = ["nfl", "nba", "nhl", "ncaab"];

/** Sports members can pick today, in chip order. */
export const liveSports = () => SPORT_ORDER.filter((s) => SPORTS[s].live);

export function isSport(value: unknown): value is Sport {
  // Own keys only: "constructor" or "__proto__" are not sports.
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SPORTS, value)
  );
}

/** Contributor lays store upper-case sport names ("NFL", "NBA", "NCAAB"). */
export function sportFromLabel(value: string | null | undefined): Sport | null {
  const key = (value || "").trim().toLowerCase();
  return isSport(key) ? key : null;
}
