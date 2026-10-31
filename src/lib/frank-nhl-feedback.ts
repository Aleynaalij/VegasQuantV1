export const feedbackQuestions = [
  {
    key: "track",
    label: "What should the NHL desk track?",
    hint: "Stats, trends, injuries, goalie starts, matchups—what matters most to you?",
  },
  {
    key: "players",
    label: "Which players do you like or follow?",
    hint: "Names, teams, roles, and what you watch for.",
  },
  {
    key: "expanded_report",
    label: "What reporting would you like when you expand a game?",
    hint: "Tell us what belongs up front, what needs more detail, or share an example.",
  },
  {
    key: "notes",
    label: "Anything else for the Vegas Quant dev team?",
    hint: "Useful sources, missing information, ideas, or anything we should know.",
  },
] as const;
export type FeedbackKey = (typeof feedbackQuestions)[number]["key"];
export type FeedbackAnswers = Record<FeedbackKey, string>;
export const emptyFeedback = (): FeedbackAnswers => ({
  track: "",
  players: "",
  expanded_report: "",
  notes: "",
});
export type FeedbackState =
  | { state: "hidden" | "offer" }
  | { state: "submitted"; answers: FeedbackAnswers; submitted_at: string };
export function feedbackState(value: unknown): FeedbackState {
  if (!value || typeof value !== "object") return { state: "hidden" };
  const v = value as Record<string, unknown>;
  if (v.state === "offer") return { state: "offer" };
  if (
    v.state !== "submitted" ||
    !v.answers ||
    typeof v.answers !== "object" ||
    typeof v.submitted_at !== "string" ||
    !Number.isFinite(Date.parse(v.submitted_at))
  )
    return { state: "hidden" };
  const raw = v.answers as Record<string, unknown>,
    answers = emptyFeedback();
  for (const { key } of feedbackQuestions) {
    if (typeof raw[key] !== "string" || [...raw[key]].length > 3000)
      return { state: "hidden" };
    answers[key] = raw[key];
  }
  return { state: "submitted", answers, submitted_at: v.submitted_at };
}
