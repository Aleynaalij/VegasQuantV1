// The one URL contract that carries a chosen game between Home and its research page:
// `/?game=<slug>#home-games` opens that game's row on Home. Home writes it while a row is open, so
// browser Back from research returns to the same open game; research links to it for the game's
// props and the lay in progress.
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export function homeGamePath(slug: string) {
  return SLUG.test(slug) ? `/?game=${slug}#home-games` : "/#home-games";
}

/** The game slug Home should open, or null. Unknown or malformed values are ignored, never guessed. */
export function homeGameFrom(search: string, slugs: readonly string[]) {
  const slug = new URLSearchParams(search).get("game");
  return slug && SLUG.test(slug) && slugs.includes(slug) ? slug : null;
}
