import type { AutopilotTask } from "./autopilot-tasks";
import type { readPreviewPublicationIntelligence } from "./nba-publication-intelligence-preview";
import type { previewNbaPublicationMonitor } from "./nba-publication-monitor-fixtures";
import type { OperationsFeedHealth } from "./operations-feed-health";

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
export type TicketCursor = { id: string; before: string };
export type OperationInput =
  | { action: "list"; history?: boolean; cursor?: TicketCursor }
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
export type OperationsRelease = {
  environment: "production" | "preview";
  deploymentId: string;
  commit: string | null;
  observedAt: string;
};
export type OperationResult =
  | { state: OperationError }
  | { state: "submitted"; id: string }
  | {
      state: "ready";
      tickets: Ticket[];
      next: TicketCursor | null;
      release?: OperationsRelease | null;
      blackboxAvailable?: boolean;
      autopilotTasks?: AutopilotTask[];
      publicationIntelligence?: Awaited<
        ReturnType<typeof readPreviewPublicationIntelligence>
      >;
      publicationMonitor?: ReturnType<typeof previewNbaPublicationMonitor>;
      feedHealth?: { checkedAt: string; feeds: OperationsFeedHealth[] };
    }
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
  const { action, id, feature, symptom, expected, history, cursor } =
    value as Record<string, unknown>;
  const keys = Object.keys(value).length;
  if (action === "list") {
    if (keys === 1) return { action };
    if (typeof history !== "boolean") return null;
    if (keys === 2 && cursor === undefined) return { action, history };
    if (
      keys !== 3 ||
      !cursor ||
      typeof cursor !== "object" ||
      Object.keys(cursor).length !== 2
    )
      return null;
    const { id, before } = cursor as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      !uuid.test(id) ||
      typeof before !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(
        before,
      ) ||
      !Number.isFinite(Date.parse(before))
    )
      return null;
    return { action, history, cursor: { id, before } };
  }
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
