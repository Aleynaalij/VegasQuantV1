import { billingReadiness } from "@/lib/billing-readiness";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await billingReadiness(), {
    headers: { "Cache-Control": "no-store" },
  });
}
