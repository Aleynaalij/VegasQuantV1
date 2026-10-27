/** Only accept real HTTPS links on Gambly's own domain. */
export function isGamblyUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["gambly.com", "www.gambly.com"].includes(url.hostname) && !url.username && !url.password && !url.port;
  } catch { return false; }
}
