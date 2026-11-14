import { z } from "zod";
import { boundedJson } from "@/lib/bounded-json";
import { requestUser, sameOrigin } from "@/lib/billing-server";
import { blackboxEnabled } from "@/lib/blackbox";

export async function POST(req: Request) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!blackboxEnabled() || process.env.VQ_BLACKBOX_EXECUTION !== "true")
    return reply({ error: "Unavailable" }, 404);
  if (!sameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  const session = await requestUser(req);
  if (!session) return reply({ error: "Sign in required" }, 401);
  const input = z
    .strictObject({
      action: z.enum([
        "list",
        "propose",
        "authorize",
        "acknowledge",
        "submit",
        "approve",
        "reject",
        "revoke",
      ]),
      id: z.uuid().optional(),
      version: z.number().int().nonnegative().max(2147483646).optional(),
      request: z.uuid().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(await boundedJson(req, 14000));
  if (!input.success) return reply({ error: "Invalid command" }, 400);
  const { action, id, version, request, payload } = input.data;
  const { data, error } = await session.db.rpc("blackbox_execution", {
    p_action: action,
    p_id: id,
    p_version: version,
    p_request: request,
    p_payload: payload,
  });
  if (!error) return reply(data);
  const status =
    { "42501": 403, "23505": 409, "22023": 400, "22P02": 400 }[error.code] ??
    503;
  return reply(
    {
      error:
        status === 409
          ? "Refresh the package before retrying"
          : "Execution request rejected",
    },
    status,
  );
}
