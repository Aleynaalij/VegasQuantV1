import { passQuote } from "@/lib/membership";
import { billingEnabled, billingMode } from "@/lib/billing-server";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      quotes: [passQuote("full"), passQuote("half")].filter(Boolean),
      enabled: billingEnabled(),
      mode: billingMode(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
