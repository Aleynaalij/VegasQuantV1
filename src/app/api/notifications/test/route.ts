import { appOrigin, requestUser } from "@/lib/billing-server";
import { sendPushTest } from "@/lib/push-test-server";
import { validPushEndpoint } from "@/lib/push";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (req.headers.get("origin") !== appOrigin())
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const auth = await requestUser(req);
  if (!auth)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const body = await req.json();
    if (
      typeof body.endpoint !== "string" ||
      body.endpoint.length > 4096 ||
      !validPushEndpoint(body.endpoint)
    )
      return Response.json(
        { error: "Valid registered device required" },
        { status: 400 },
      );
    const result = await sendPushTest(auth.user.id, body.endpoint);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Test alert unavailable. Please retry." },
      { status: 503 },
    );
  }
}
