const dayMs = 86_400_000;
const visitsApi = "https://api.vercel.com/v1/query/web-analytics/visits";
type Counts = { visitors: number; pageviews: number };
export type OperationsTraffic =
  | { state: "not_connected" | "unavailable" }
  | {
      state: "ready";
      since: string;
      until: string;
      checkedAt: string;
      totals: Counts;
      trend: (Counts & { day: string })[] | null;
    };

function counts(value: unknown): Counts | null {
  const row = value as Counts | null;
  if (
    !row ||
    !Number.isSafeInteger(row.visitors) ||
    !Number.isSafeInteger(row.pageviews) ||
    row.visitors < 0 ||
    row.pageviews < row.visitors
  )
    return null;
  return { visitors: row.visitors, pageviews: row.pageviews };
}

export async function observeOperationsTraffic(
  now = new Date(),
): Promise<OperationsTraffic> {
  const {
    VQ_ANALYTICS_READ_TOKEN: token,
    VQ_ANALYTICS_PROJECT_ID: projectId,
    VQ_ANALYTICS_TEAM_ID: teamId,
  } = process.env;
  if (
    !token ||
    !projectId ||
    !teamId ||
    process.env.VERCEL_ENV !== "production"
  )
    return { state: "not_connected" };
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const since = new Date(end - 7 * dayMs).toISOString();
  const until = new Date(end - 1).toISOString();
  const timeout = AbortSignal.timeout(3000);
  async function read(kind: "count" | "aggregate"): Promise<unknown> {
    try {
      const query = new URLSearchParams({
        teamId: teamId!,
        projectId: projectId!,
        since,
        until,
      });
      if (kind === "aggregate") query.set("by", "day");
      const response = await fetch(`${visitsApi}/${kind}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        redirect: "error",
        signal: timeout,
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result?.version === 1 ? result.data : null;
    } catch {
      return null;
    }
  }
  const [totalData, trendData] = await Promise.all([
    read("count"),
    read("aggregate"),
  ]);
  const totals = counts(totalData);
  if (!totals) return { state: "unavailable" };
  let trend: (Counts & { day: string })[] | null = null;
  if (Array.isArray(trendData) && trendData.length <= 7) {
    const rows = new Map<string, Counts>();
    for (const row of trendData) {
      const data = counts(row);
      const timestamp =
        typeof row?.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
      if (
        !data ||
        !Number.isFinite(timestamp) ||
        timestamp % dayMs !== 0 ||
        timestamp < end - 7 * dayMs ||
        timestamp >= end
      )
        break;
      const day = new Date(timestamp).toISOString().slice(0, 10);
      if (rows.has(day)) break;
      rows.set(day, data);
    }
    if (rows.size === trendData.length)
      trend = [...rows]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, data]) => ({ day, ...data }));
  }
  return {
    state: "ready",
    since,
    until,
    checkedAt: now.toISOString(),
    totals,
    trend,
  };
}
