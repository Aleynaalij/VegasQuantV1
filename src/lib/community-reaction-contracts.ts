export const REACTION_TYPES = ["heart", "celebrate", "fire", "thinking"] as const;
export type ReactionType = typeof REACTION_TYPES[number];
export type ReactionState = { version: 1; post_id: string; total: number; counts: Record<ReactionType, number>; mine: ReactionType | null };
const isReaction = (v: unknown): v is ReactionType => typeof v === "string" && (REACTION_TYPES as readonly string[]).includes(v);
/** Same selected choice removes it. Send an explicit desired value, never a retry-sensitive toggle. */
export function nextReaction(current: ReactionType | null, choice: ReactionType): ReactionType | null {
  return current === choice ? null : choice;
}
/** Reject stale/wrong-post or malformed summaries; never invent counts after a failed write. */
export function reactionState(value: unknown, postId: string): ReactionState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ReactionState>;
  if (v.version !== 1 || v.post_id !== postId || !Number.isSafeInteger(v.total) || v.total! < 0 ||
      !v.counts || (v.mine !== null && !isReaction(v.mine))) return null;
  if (REACTION_TYPES.some(k => !Number.isSafeInteger(v.counts![k]) || v.counts![k] < 0) ||
      REACTION_TYPES.reduce((n, k) => n + v.counts![k], 0) !== v.total ||
      (v.mine && !v.counts[v.mine])) return null;
  return { version: 1, post_id: postId, total: v.total!, mine: v.mine!,
    counts: Object.fromEntries(REACTION_TYPES.map(k => [k, v.counts![k]])) as Record<ReactionType, number> };
}
