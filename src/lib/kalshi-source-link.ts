/** A contributor-shared source locator, never evidence of an executed position. No network I/O. */
export function normalizeKalshiSourceLink(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    /[\s\u0000-\u001f\u007f\\%]/.test(value)
  )
    return null;
  // Reject URL parser repairs, encoded separators and noncanonical hosts/ports before parsing.
  if (
    !/^https:\/\/(?:www\.)?kalshi\.com\/markets\/kxmvecrosscategory\/combo\/[A-Za-z0-9_-]{1,200}(?:\?[^#]*)?(?:#[^]*)?$/.test(
      value,
    )
  )
    return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.port ||
      !["kalshi.com", "www.kalshi.com"].includes(url.hostname)
    )
      return null;
    const tickers = url.searchParams.getAll("marketTicker");
    if (tickers.length !== 1 || !/^[A-Za-z0-9_-]{1,200}$/.test(tickers[0]))
      return null;
    // Query keys differing only by case are ambiguous locators, not tracking parameters.
    for (const key of url.searchParams.keys())
      if (
        (key.toLowerCase().includes("ticker") ||
          ["market", "event"].includes(key.toLowerCase())) &&
        key !== "marketTicker"
      )
        return null;
    return `https://${url.hostname}${url.pathname}?marketTicker=${tickers[0]}`;
  } catch {
    return null;
  }
}
