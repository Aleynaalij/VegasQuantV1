// Matches a member's followed teams and players to upcoming games and recent research.
export type Follow = { kind: string; topic: string };
export type ForYouGame = {
  id: string;
  slug: string;
  kickoff: string;
  away_team: string;
  home_team: string;
};
export type ForYouPost = {
  id: string;
  title: string;
  matchup: string;
  summary?: string;
  game_id: string | null;
  created_at: string;
};
export type ForYouItem = {
  follow: Follow;
  game: ForYouGame | null;
  post: ForYouPost | null;
};

const has = (text: string | undefined, topic: string) =>
  !!text && text.toLowerCase().includes(topic.toLowerCase());

/** One row per follow: the next game for a followed team and the newest matching update. */
export function forYou(
  follows: Follow[],
  games: ForYouGame[],
  posts: ForYouPost[],
  now = Date.now(),
): ForYouItem[] {
  const upcoming = games
    .filter((g) => Date.parse(g.kickoff) > now - 4 * 3600000)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const newest = [...posts].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  return follows.map((follow) => {
    const teamGame =
      follow.kind === "team"
        ? upcoming.find(
            (g) =>
              g.away_team.toLowerCase() === follow.topic.toLowerCase() ||
              g.home_team.toLowerCase() === follow.topic.toLowerCase(),
          ) || null
        : null;
    const post =
      newest.find((p) =>
        follow.kind === "team"
          ? (teamGame && p.game_id === teamGame.id) ||
            has(p.title, follow.topic) ||
            has(p.matchup, follow.topic)
          : has(p.title, follow.topic) || has(p.summary, follow.topic),
      ) || null;
    return { follow, game: teamGame, post };
  });
}
