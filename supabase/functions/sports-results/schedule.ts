type Game = { id: string };
type Progress = { game_id: string; checked_at: string; status: string };
type Attempt = { game_id: string; attempted_at: string };
const stamp = (value?: string) => {
  const n = Date.parse(value || "");
  return Number.isFinite(n) ? n : 0;
};

/** Failed reads rotate too; keep attempt scheduling separate from confirmed result evidence. */
export function resultBatch<T extends Game>(
  games: T[],
  progress: Progress[],
  attempts: Attempt[],
  now: number,
) {
  const states = new Map(progress.map((p) => [p.game_id, p]));
  const tried = new Map(
    attempts.map((a) => [a.game_id, stamp(a.attempted_at)]),
  );
  const last = (g: T) =>
    Math.max(stamp(states.get(g.id)?.checked_at), tried.get(g.id) || 0);
  return games
    .filter(
      (g) =>
        now - last(g) >=
        (["FINAL", "CONFLICT", "NO_RESULT"].includes(
          states.get(g.id)?.status || "",
        )
          ? 6 * 3600000
          : 15 * 60000),
    )
    .sort((a, b) => last(a) - last(b) || a.id.localeCompare(b.id))
    .slice(0, 24);
}
