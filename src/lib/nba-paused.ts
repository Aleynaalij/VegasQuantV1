// NBA is paused (owner decision, Oct 22 2026): the NBA pages are closed and the sport switch shows a
// "coming soon" chip. Data still collects once a day so the season's games are on record when it returns.
export const NBA_PAUSED = true;

export const NBA_PAUSED_TITLE = "NBA is coming soon";
export const NBA_PAUSED_MESSAGE =
  "We're giving the NBA season some time. The platform keeps collecting game data every day until it is a source we can reference: we want to watch a few games play out and see what players are doing this year before we put money into it. NFL has been great, so that's where our focus is for now.";

/** Old NBA links land here, and the coming-soon message opens on arrival. */
export const NBA_PAUSED_HREF = "/?nba=soon";
