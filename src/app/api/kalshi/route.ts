import {
  KALSHI_ENABLED,
  KALSHI_PAUSED_MESSAGE,
} from "@/lib/kalshi-availability";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Fail closed before authentication, database reads or external provider requests.
  if (!KALSHI_ENABLED)
    return Response.json(
      { code: "KALSHI_PAUSED", error: KALSHI_PAUSED_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  const { lookupKalshi } = await import("@/lib/kalshi-lookup");
  return lookupKalshi(req);
}
