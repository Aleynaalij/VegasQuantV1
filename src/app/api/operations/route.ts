import { observeOperationsRelease } from "@/lib/operations-release";
import { requestUser, sameOrigin } from "@/lib/billing-server";
import {
  operationErrors,
  parseOperationInput,
  type OperationResult,
} from "@/lib/operations-support";

const headers = { "Cache-Control": "private, no-store" };
function reply(result: OperationResult) {
  const status =
    result.state === "ready" || result.state === "submitted"
      ? 200
      : operationErrors[result.state];
  return Response.json(status === 200 ? result : { state: result.state }, {
    status,
    headers,
  });
}

async function boundedJson(req: Request): Promise<unknown> {
  if (
    !req.headers.get("content-type")?.startsWith("application/json") ||
    !req.body
  )
    return null;
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > 2048) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ state: "forbidden" });
  const input = parseOperationInput(await boundedJson(req));
  if (!input) return reply({ state: "invalid" });
  try {
    const session = await requestUser(req);
    if (!session) return reply({ state: "unauthenticated" });
    // The user's verified bearer goes to Postgres, which independently enforces
    // session eligibility and admin MFA before returning or mutating queue data.
    const { data, error } = await session.db.rpc("operations_support", {
      p_action: input.action,
      p_id: input.action === "list" ? (input.cursor?.id ?? null) : input.id,
      p_before: input.action === "list" ? (input.cursor?.before ?? null) : null,
      p_history: input.action === "list" ? (input.history ?? false) : false,
      p_feature: input.action === "submit" ? input.feature : null,
      p_symptom: input.action === "submit" ? input.symptom : null,
      p_expected: input.action === "triage" ? input.expected : null,
    });
    if (
      error ||
      !data ||
      typeof data.state !== "string" ||
      (data.state !== "ready" &&
        data.state !== "submitted" &&
        !Object.hasOwn(operationErrors, data.state))
    )
      return reply({ state: "unavailable" });
    const result = data as OperationResult;
    if (
      input.action === "list" &&
      result.state === "ready" &&
      "tickets" in result
    )
      return reply({ ...result, release: observeOperationsRelease() });
    return reply(result);
  } catch {
    return reply({ state: "unavailable" });
  }
}
