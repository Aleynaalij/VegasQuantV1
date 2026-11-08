// Reddit-style Zone votes: state shape, the optimistic update and score display.

export type Vote = -1 | 1;
export type VoteState = {
  post_id: string;
  up: number;
  down: number;
  score: number;
  mine: Vote | null;
};

/** Tapping the arrow you already chose clears it; tapping the other arrow switches. */
export const nextVote = (mine: Vote | null, tapped: Vote): Vote | null =>
  mine === tapped ? null : tapped;

/** The state after the caller's vote moves from `prev.mine` to `next`, before the server answers. */
export function applyVote(prev: VoteState, next: Vote | null): VoteState {
  let { up, down } = prev;
  if (prev.mine === 1) up--;
  if (prev.mine === -1) down--;
  if (next === 1) up++;
  if (next === -1) down++;
  return { ...prev, up, down, score: up - down, mine: next };
}

/** 999 → "999", 1234 → "1.2k", 25000 → "25k", negatives keep their sign. */
export function formatScore(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(n);
  const k = a / 1000;
  return `${n < 0 ? "-" : ""}${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}

export function isVoteState(x: unknown): x is VoteState {
  const s = x as VoteState;
  return (
    !!s &&
    typeof s.post_id === "string" &&
    [s.up, s.down, s.score].every((v) => typeof v === "number") &&
    (s.mine === null || s.mine === 1 || s.mine === -1)
  );
}
