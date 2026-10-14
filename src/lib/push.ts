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
/** Release a price alert points to ("price:<release id>"), or null. */
export function priceAlertRelease(eventKey: string | null | undefined) {
  const id = eventKey?.startsWith("price:") ? eventKey.slice(6) : "";
  return UUID.test(id) ? id.toLowerCase() : null;
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
    ...(job.event_key?.startsWith("app-update:")
      ? {
          announcement:
            "Vegas Quant has been updated. Open the app for the new design, game board and community.",
        }
      : {}),
  };
}
