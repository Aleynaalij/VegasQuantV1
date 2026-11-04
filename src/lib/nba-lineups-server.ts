import {
  easternLineupDay,
  NBA_LINEUP_SOURCE,
  parseNbaLineups,
  type LineupReport,
} from "./nba-lineups";
/** One bounded public-source request per minute per server instance; never retain a failed
 * response as a successful check. Shared pending promise prevents a burst per open game. */
export function createLineupLoader(
  fetcher: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  let cached: LineupReport | null = null,
    pending: Promise<LineupReport> | null = null;
  return async function load(): Promise<LineupReport> {
    const now = clock(),
      age = now - Date.parse(cached?.checked_at || "");
    if (cached && age >= 0 && age < 60000) return cached;
    if (pending) return pending;
    pending = (async () => {
      const response = await fetcher(NBA_LINEUP_SOURCE, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)",
          Accept: "text/html",
        },
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw Error("Lineup provider unavailable");
      if (Number(response.headers.get("content-length") || 0) > 1_000_000)
        throw Error("Lineup source too large");
      const reader = response.body?.getReader();
      if (!reader) throw Error("Empty lineup source");
      const decoder = new TextDecoder();
      let html = "",
        bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 1_000_000) throw Error("Lineup source too large");
          html += decoder.decode(part.value, { stream: true });
        }
        html += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
      // HTTP Date bounds proxy staleness. Never relabel a source cached for minutes as current.
      const fetched = clock(),
        providerAt = Date.parse(response.headers.get("date") || "");
      if (
        !Number.isFinite(providerAt) ||
        providerAt > fetched + 30000 ||
        fetched - providerAt > 180000
      )
        throw Error("Lineup source stale");
      const checkedAt = Math.min(now, providerAt);
      const report = parseNbaLineups(html, checkedAt);
      // An ET midnight crossed during the fetch needs a new page, not yesterday's lineup.
      if (easternLineupDay(checkedAt) !== easternLineupDay(fetched))
        throw Error("Lineup date changed");
      cached = report;
      return report;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}
export const loadNbaLineups = createLineupLoader();
