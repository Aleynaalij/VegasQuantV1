import {
  closingLineRecord,
  OFFICIAL_KINDS,
  pricedRecord,
  type PricedLeg,
  type TrackedPrice,
} from "./priced-record";

/**
 * When Home leads with the record (owner, Oct 31 2026): once official picks are profitable over a
 * meaningful sample, or once the sample is large enough that the record speaks for itself either way.
 * Until then the card stays off Home (admins see a labelled preview) and the full record lives on Records.
 */
export const HOME_RECORD_RULE = {
  profitableAfter: 50,
  alwaysAfter: 150,
} as const;

export type HomeRecord = {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  roi: number | null;
  hitRate: number | null;
  breakEvenRate: number | null;
  clvLegs: number;
  beatCloseRate: number | null;
  avgClvPoints: number | null;
  since: string | null;
  visible: boolean;
};

export function homeVisible(r: Pick<HomeRecord, "picks" | "units">) {
  return (
    (r.picks >= HOME_RECORD_RULE.profitableAfter && r.units > 0) ||
    r.picks >= HOME_RECORD_RULE.alwaysAfter
  );
}

/** The official record exactly as the Records page computes it, reduced to totals. */
export function homeRecord(
  all: PricedLeg[],
  tracked: Map<string, TrackedPrice>,
): HomeRecord {
  const legs = all.filter(
    (l) => OFFICIAL_KINDS.includes(l.kind) && l.result !== null,
  );
  const closing = new Map(
    legs
      .filter((l) => tracked.has(l.leg_key))
      .map((l) => [l.leg_key, tracked.get(l.leg_key)!.last]),
  );
  const r = pricedRecord(legs, closing);
  const clv = closingLineRecord(
    all.filter((l) => OFFICIAL_KINDS.includes(l.kind)),
    tracked,
  );
  const since = legs
    .map((l) => l.published_at)
    .sort()
    .at(0);
  const record = {
    picks: r.picks,
    wins: r.wins,
    losses: r.losses,
    pushes: r.pushes,
    units: Math.round(r.units * 100) / 100,
    roi: r.roi,
    hitRate: r.hitRate,
    breakEvenRate: r.breakEvenRate,
    clvLegs: clv.legs,
    beatCloseRate: clv.beatRate,
    avgClvPoints: clv.avgPoints,
    since: since ?? null,
  };
  return { ...record, visible: homeVisible(record) };
}
