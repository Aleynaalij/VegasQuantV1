export const operationFeatures = [
  "account",
  "research",
  "zone",
  "records",
  "other",
] as const;
export const operationSymptoms = [
  "unavailable",
  "incorrect",
  "slow",
  "other",
] as const;
export const operationStatuses = ["new", "in_review", "resolved"] as const;
type Feature = (typeof operationFeatures)[number];
type Symptom = (typeof operationSymptoms)[number];
export type OperationStatus = (typeof operationStatuses)[number];
export type Ticket = {
  id: string;
  feature: Feature;
  symptom: Symptom;
  status: OperationStatus;
  created_at: string;
  updated_at: string;
};
export type TicketEvent = {
  action: "submitted" | "triaged" | "resolved";
  status: OperationStatus;
  created_at: string;
};
export type OperationInput =
  | { action: "list" }
  | { action: "detail"; id: string }
  | { action: "triage"; id: string; expected: "new" | "in_review" }
  | { action: "submit"; id: string; feature: Feature; symptom: Symptom };
export const operationErrors = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  limit: 429,
  unavailable: 503,
} as const;
export type OperationError = keyof typeof operationErrors;
export type OperationResult =
  | { state: OperationError }
  | { state: "submitted"; id: string }
  | { state: "ready"; tickets: Ticket[] }
  | { state: "ready"; ticket: Ticket; events: TicketEvent[] };

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.some((item) => item === value);
}

export function parseOperationInput(value: unknown): OperationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { action, id, feature, symptom, expected } = value as Record<
    string,
    unknown
  >;
  const keys = Object.keys(value).length;
  if (action === "list" && keys === 1) return { action };
  if (typeof id !== "string" || !uuid.test(id)) return null;
  if (action === "detail" && keys === 2) return { action, id };
  if (
    action === "triage" &&
    keys === 3 &&
    (expected === "new" || expected === "in_review")
  )
    return { action, id, expected };
  if (
    action === "submit" &&
    keys === 4 &&
    includes(operationFeatures, feature) &&
    includes(operationSymptoms, symptom)
  )
    return { action, id, feature, symptom };
  return null;
}
