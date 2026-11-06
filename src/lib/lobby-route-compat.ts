/** Same-origin legacy NFL bookmark compatibility; the neutral lobby stays neutral otherwise. */
export function legacyNflHashTarget(href: string): string | null {
  const url = new URL(href, "https://vegasquant.invalid");
  if (url.pathname !== "/" || url.hash !== "#home-games") return null;
  return `/nfl${url.search}${url.hash}`;
}
