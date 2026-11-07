import { normalizeKalshiSourceLink } from "./kalshi-source-link";

/** Owner-requested temporary pause. Re-enable only in a separately approved release. */
export const KALSHI_ENABLED = false;
export const KALSHI_PAUSED_MESSAGE = "Kalshi is temporarily unavailable.";

/** Keep stored history intact, but do not expose a paused source as a copy/open action. */
export function actionableKalshiSource(source: unknown): string | null {
  return KALSHI_ENABLED ? normalizeKalshiSourceLink(source) : null;
}
