import type { AlertCandidate, PlannedAlert } from "./live-alerts";

export type ZoneResultHealth = {
  pending: number;
  due: number;
  blocked: number;
};
export type ZoneRetrySummary = {
  attempted: number;
  posted: number;
  failed: number;
};

type Dependencies = {
  candidates: () => Promise<AlertCandidate[]>;
  plan: (candidates: AlertCandidate[]) => Promise<PlannedAlert[]>;
  publish: (alert: PlannedAlert) => Promise<void>;
  retryZone: () => Promise<ZoneRetrySummary>;
  zoneHealth: () => Promise<ZoneResultHealth>;
};

/** Durable Zone work starts independently of score feeds and never gates new pick alerts. */
export async function dispatchLiveAlerts(deps: Dependencies) {
  let candidates = 0,
    decided = 0,
    sent = 0,
    failed = 0;
  let liveUnavailable = false,
    zoneUnavailable = false;
  let health: ZoneResultHealth | null = null;
  const zoneWork = (async (): Promise<ZoneRetrySummary | null> => {
    try {
      return await deps.retryZone();
    } catch {
      zoneUnavailable = true;
      return null;
    }
  })();
  const liveWork = (async () => {
    try {
      const rows = await deps.candidates();
      candidates = rows.length;
      const planned = await deps.plan(rows);
      decided = planned.length;
      for (const alert of planned) {
        try {
          await deps.publish(alert);
          sent++;
        } catch {
          failed++;
        }
      }
    } catch {
      liveUnavailable = true;
    }
  })();
  const [retry] = await Promise.all([zoneWork, liveWork]);
  // Acceptance only queues Zone work. A separate RPC can publish fresh results promptly, but
  // a timeout or lock wait here can never roll back already committed notification fan-out.
  let fresh: ZoneRetrySummary | null = null;
  if (sent > 0) {
    try {
      fresh = await deps.retryZone();
    } catch {
      zoneUnavailable = true;
    }
  }
  // Read after both drains, including failures from fresh results' first publication attempts.
  try {
    health = await deps.zoneHealth();
  } catch {
    zoneUnavailable = true;
  }
  return {
    ok:
      !liveUnavailable &&
      !zoneUnavailable &&
      failed === 0 &&
      health !== null &&
      health.pending === 0 &&
      health.blocked === 0,
    candidates,
    decided,
    sent,
    failed,
    live_unavailable: liveUnavailable,
    zone_unavailable: zoneUnavailable,
    zone: { retry, fresh, health },
  };
}
