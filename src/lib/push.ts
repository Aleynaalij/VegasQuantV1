// Only known browser push services can receive server requests.
export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Release a price alert points to ("price:<release id>[:move:…]"), or null. */
export function priceAlertRelease(eventKey: string | null | undefined) {
  const id = eventKey?.startsWith("price:") ? eventKey.slice(6).split(":")[0] : "";
  return UUID.test(id) ? id.toLowerCase() : null;
}
const PRICE = /^-?\d+(?:\.\d+)?$/;
const odds = (s: string) => (Number(s) > 0 ? `+${Number(s)}` : String(Number(s)));
/**
 * Notification text for a market move ("price:<release>:move:<leg>:<against|toward>:<from>:<to>"), or
 * null for any other event. Built only from validated numbers, never from free text.
 */
export function priceMoveMessage(eventKey: string | null | undefined) {
  const parts = (eventKey || "").split(":");
  if (parts.length !== 7 || parts[0] !== "price" || parts[2] !== "move" || !UUID.test(parts[1])) return null;
  if (!/^\d{1,3}$/.test(parts[3])) return null;
  const [, , , , direction, from, to] = parts;
  if (!["against", "toward"].includes(direction) || !PRICE.test(from) || !PRICE.test(to)) return null;
  const cents = (p: number) => (p < 0 ? p + 100 : p - 100);
  const moved = Math.round(Math.abs(cents(Number(to)) - cents(Number(from))));
  return direction === "against"
    ? `A leg you're on moved ${odds(from)} → ${odds(to)}, ${moved} cents against the pick. Recheck it before kickoff.`
    : `A leg you're on moved ${odds(from)} → ${odds(to)}: the market moved ${moved} cents toward the pick.`;
}
/** The JSON sent to the service worker for one queued delivery. */
export function pushPayload(job: {
  pick_id: string | null;
  type: string;
  event_key?: string | null;
}) {
  const release = job.type === "price" ? priceAlertRelease(job.event_key) : null;
  return {
    pick_id: job.pick_id,
    type: job.type,
    ...(release ? { release } : {}),
    ...(job.type === "price" && priceMoveMessage(job.event_key)
      ? { announcement: priceMoveMessage(job.event_key) }
      : {}),
    ...(job.event_key?.startsWith("app-update:")
      ? {
          announcement:
            "Vegas Quant has been updated. Open the app for the new design, game board and community.",
        }
      : {}),
  };
}
