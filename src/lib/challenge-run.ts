export type Run = {
  user_id: string;
  challenge_id: string;
  mode: "follow" | "track";
  count_me: boolean;
  joined_at: string;
};
export type JourneyStage = { stage_number: number; status: string };
export const stageLabels = [
  "Thursday night",
  "Sunday early",
  "Sunday late",
  "Sunday night",
  "Monday night",
];
export function runMessage(status: string) {
  if (status === "PASS / PAUSED")
    return {
      title: "Patience is part of the challenge.",
      body: "Paused—waiting for a qualifying play. A pass protects the process.",
    };
  if (status === "OFFICIAL PLAY")
    return {
      title: "The play is here.",
      body: "See the official slip below. Following along never requires a wager.",
    };
  if (status === "WON")
    return {
      title: "Stage settled. On to the review.",
      body: "Check the result and what we learned before the next decision.",
    };
  if (status === "LOST")
    return {
      title: "This leg didn’t land.",
      body: "The result stays on the record. Take a look at the review—there’s no need to chase it.",
    };
  if (status === "PUSH")
    return {
      title: "A push. The stake comes back.",
      body: "The next decision still needs to qualify.",
    };
  if (status === "COMPLETED")
    return {
      title: "The run is complete.",
      body: "Five decisions, a permanent record. Look back at the process.",
    };
  return {
    title: "Your next play is being researched.",
    body: "We’ll publish when a play qualifies. If it doesn’t, we pass.",
  };
}
export function canCheckIn(status: string) {
  return [
    "OFFICIAL PLAY",
    "WON",
    "LOST",
    "PUSH",
    "PASS / PAUSED",
    "COMPLETED",
  ].includes(status);
}
export function runShareText(number: number, followed: number, status: string) {
  return `VEGAS QUANT · The 5-Spot Challenge #${number}\n${followed}/5 stages followed · ${status}\nFollow along without placing a wager. No outcome is guaranteed.`;
}
