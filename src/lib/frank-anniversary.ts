export const anniversaryQuery = "vq-anniversary";
export const celebrationDuration = 5000;
export type AnniversaryState =
  | { state: "hidden" | "offer" | "done" | "celebrate" }
  | { state: "revealed"; token: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function anniversaryToken(value: unknown): value is string {
  return typeof value === "string" && uuid.test(value);
}
export function anniversaryState(value: unknown): AnniversaryState {
  if (!value || typeof value !== "object" || !("state" in value))
    return { state: "hidden" };
  if (value.state === "revealed")
    return "token" in value && anniversaryToken(value.token)
      ? { state: "revealed", token: value.token }
      : { state: "hidden" };
  return typeof value.state === "string" &&
    ["hidden", "offer", "done", "celebrate"].includes(value.state)
    ? { state: value.state as "hidden" | "offer" | "done" | "celebrate" }
    : { state: "hidden" };
}
export function anniversaryDestination(token: string) {
  if (!anniversaryToken(token)) throw new Error("Invalid anniversary handoff");
  return `/nhl?${anniversaryQuery}=${encodeURIComponent(token)}`;
}
