import { boundedJson } from "@/lib/bounded-json";
import { z } from "zod";
import { requestUser, sameOrigin } from "@/lib/billing-server";
import { blackboxEnabled } from "@/lib/blackbox";

export async function POST(req: Request) {
  const reply = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!blackboxEnabled()) return reply({ error: "Unavailable" }, 404);
  if (!sameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  const session = await requestUser(req);
  if (!session) return reply({ error: "Sign in required" }, 401);
  const input = z
    .strictObject({
      action: z.enum([
        "list",
        "assign",
        "handoff",
        "acknowledge",
        "escalate",
        "submit",
        "approve",
        "reject",
      ]),
      task: z.string().max(160).optional(),
      version: z.number().int().nonnegative().max(2147483646).optional(),
      request: z.uuid().optional(),
      evidence: z.string().max(1500).optional(),
      target: z.uuid().optional(),
      outcome: z
        .strictObject({
          conclusion: z.string().trim().min(1).max(1500),
          confidence: z.enum(["low", "medium", "high"]),
          rootCause: z.string().max(500).optional(),
          fix: z.string().max(500).optional(),
          tests: z.string().max(500).optional(),
          deployment: z.string().max(500).optional(),
          rollback: z.string().max(500).optional(),
          runbook: z.string().max(500).optional(),
        })
        .optional(),
    })
    .safeParse(await boundedJson(req, 12288));
  if (!input.success) return reply({ error: "Invalid request" }, 400);
  const { action, task, version, request, evidence, target, outcome } =
    input.data;
  const { data, error } = await session.db.rpc("blackbox_stage", {
    p_action: action,
    p_task: task,
    p_version: version,
    p_request: request,
    p_evidence: evidence,
    p_target: target,
    p_outcome: outcome,
  });
  if (error) {
    if (error.code === "42501") return reply({ error: "Forbidden" }, 403);
    if (["40001", "23505"].includes(error.code))
      return reply({ error: "Refresh the task before retrying" }, 409);
    if (error.code === "22023") return reply({ error: "Invalid action" }, 400);
    return reply({ error: "Unavailable" }, 503);
  }
  return reply(data);
}
