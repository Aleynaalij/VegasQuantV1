/** Reviewed consumer pages only; all legacy APIs, image handlers, admin routes and workers are denied. */
export const STAGE_CONSUMER_ROUTES = [
  "/about",
  "/account/recovery",
  "/account/verify-age",
  "/community/[username]",
  "/community",
  "/faq",
  "/feed",
  "/games/[slug]",
  "/games",
  "/history",
  "/matchups/[slug]",
  "/matchups/[slug]/picks",
  "/matchups/game/[id]",
  "/matchups",
  "/membership",
  "/methodology",
  "/nba/analysis",
  "/nba/games/[slug]",
  "/nba/matchup-sheet/[id]",
  "/nba/props",
  "/nba",
  "/nba/records",
  "/nba/rules",
  "/nba/zone",
  "/nba-research",
  "/ncaab/games/[slug]",
  "/ncaab",
  "/ncaab/records",
  "/nfl",
  "/nhl/games/[slug]",
  "/nhl",
  "/nhl/records",
  "/notifications",
  "/",
  "/parlays",
  "/parlays/tailed",
  "/performance",
  "/picks/[id]/share",
  "/privacy",
  "/research",
  "/responsible-play",
  "/saved",
  "/simulator",
  "/slots",
  "/staging/discovery/access-denied",
  "/staging/discovery/home",
  "/staging/discovery",
  "/staging/discovery/rooms/[sport]/[id]",
  "/staging/discovery/zone",
  "/support",
  "/support/report",
  "/sweat/[id]",
  "/terms",
  "/vegas-fear",
] as const;
export function stageConsumerRoute(path: string) {
  const normalized = path.length > 1 ? path.replace(/\/$/, "") : path;
  return STAGE_CONSUMER_ROUTES.some((route) => {
    const pattern = route
      .split("/")
      .map((part) =>
        part.startsWith("[")
          ? "[^/]+"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/");
    return new RegExp(`^${pattern}$`).test(normalized);
  });
}
