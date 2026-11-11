// Zone polls: draft validation (mirrors the database checks) and result display maths.

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 60;

export type PollDraft = { question: string; options: string[] };
export type PollState = {
  post_id: string;
  question: string;
  options: string[];
  counts: number[];
  total: number;
  mine: number | null;
};

export const emptyPoll = (): PollDraft => ({ question: "", options: ["", ""] });

/** Null when the draft can be published, otherwise a plain reason. */
export function pollDraftProblem(d: PollDraft): string | null {
  const q = d.question.trim();
  if (!q) return "Add a poll question.";
  if (q.length > POLL_QUESTION_MAX)
    return `Keep the question under ${POLL_QUESTION_MAX} characters.`;
  const opts = d.options.map((o) => o.trim()).filter(Boolean);
  if (opts.length < POLL_MIN_OPTIONS) return "Add at least two options.";
  if (opts.length > POLL_MAX_OPTIONS) return "Use at most four options.";
  if (opts.some((o) => o.length > POLL_OPTION_MAX))
    return `Keep each option under ${POLL_OPTION_MAX} characters.`;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length)
    return "Each option must be different.";
  return null;
}

/** The trimmed, non-empty options that will be published. */
export const pollOptions = (d: PollDraft) =>
  d.options.map((o) => o.trim()).filter(Boolean);

/** Whole-number percentages that always add up to 100 (largest remainder), or zeros with no votes. */
export function pollPercents(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c * 100) / total);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

export function isPollState(x: unknown): x is PollState {
  const s = x as PollState;
  return (
    !!s &&
    typeof s.post_id === "string" &&
    typeof s.question === "string" &&
    Array.isArray(s.options) &&
    Array.isArray(s.counts) &&
    s.options.length === s.counts.length &&
    typeof s.total === "number" &&
    (s.mine === null || typeof s.mine === "number")
  );
}
