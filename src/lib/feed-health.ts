export type FeedRun = {
  provider: string;
  status: string;
  created_at: string;
  details?: Record<string, unknown>;
};
/** Job evidence only. fetched_at is retrieval time, never a provider quote timestamp.
 * Callers supply the existing job threshold; this helper does not choose a sport cadence.
 */
export function feedRunHealth(
  row: FeedRun | undefined,
  now: number,
  maxAgeMs: number,
) {
  const runAt = row ? Date.parse(row.created_at) : NaN;
  const validClock =
    Number.isFinite(now) && Number.isFinite(maxAgeMs) && maxAgeMs > 0;
  const timeState = !row
    ? "missing"
    : !validClock || !Number.isFinite(runAt)
      ? "invalid"
      : runAt > now
        ? "future"
        : now - runAt > maxAgeMs
          ? "stale"
          : "current";
  const raw = row?.status.trim().toLowerCase();
  const state = !row
    ? "missing"
    : raw === "error" || raw === "failed"
      ? "failed"
      : raw === "partial"
        ? "partial"
        : raw === "no upcoming events"
          ? "no_events"
          : raw === "not due" ||
              (raw === "ok" && row.details?.carried_forward === true)
            ? "not_due"
            : raw === "skipped"
              ? "skipped"
              : raw === "ok"
                ? "ok"
                : "unknown";
  const fetched =
    typeof row?.details?.fetched_at === "string"
      ? Date.parse(row.details.fetched_at)
      : NaN;
  return {
    state,
    timeState,
    runAt: Number.isFinite(runAt) ? runAt : null,
    // Reject invalid, future and impossible retrieval-after-run timestamps. No fallback to now.
    fetchedAt:
      validClock &&
      Number.isFinite(fetched) &&
      Number.isFinite(runAt) &&
      fetched <= runAt &&
      fetched <= now
        ? fetched
        : null,
  };
}

export function feedAlerts(rows: FeedRun[], now: number) {
  const required = [
    "ESPN",
    "ESPN injuries",
    "ESPN news",
    "The Odds API",
    "The Odds API props",
    "Editorial result sync",
  ];
  return required.flatMap((provider) => {
    const latest = rows
      .filter(
        (r) =>
          r.provider === provider &&
          Date.parse(r.created_at) <= now &&
          !(
            r.status === "ok" &&
            ["The Odds API", "The Odds API props"].includes(provider) &&
            r.details != null &&
            r.details.quoted_markets == null &&
            r.details.events == null
          ),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!latest) return [{ provider, reason: "No verified refresh recorded" }];
    const health = feedRunHealth(latest, now, 30 * 60000);
    const stale = health.timeState === "stale";
    if (!["ok", "no upcoming events"].includes(latest.status))
      return [
        {
          provider,
          reason:
            latest.status + (stale ? "; refresh older than 30 minutes" : ""),
        },
      ];
    if (stale) return [{ provider, reason: "Refresh older than 30 minutes" }];
    return [];
  });
}
export function researchDeadline(latest: string | null, now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (key: string) => parts.find((p) => p.type === key)?.value || "";
  const current = Number(get("hour")) * 60 + Number(get("minute"));
  const hour = [19, 15, 12].find((h) => current >= h * 60 + 15);
  if (hour === undefined) return null;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const then = latest ? new Date(latest) : null;
  if (then && Number.isFinite(then.getTime()) && then.getTime() <= now) {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(then);
    const val = (k: string) => f.find((p) => p.type === k)?.value;
    if (
      `${val("year")}-${val("month")}-${val("day")}` === day &&
      Number(val("hour")) >= hour
    )
      return null;
  }
  return `No research publication recorded since ${hour === 12 ? "noon" : hour === 15 ? "3 PM" : "7 PM"} ET today`;
}
