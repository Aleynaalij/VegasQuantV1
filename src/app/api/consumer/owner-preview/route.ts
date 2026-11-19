import { productionOwnerEnvironment } from "@/lib/production-owner-server";
import { productionOwnerResponse } from "@/lib/production-owner-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(req: Request) {
  return productionOwnerResponse(req, productionOwnerEnvironment());
}
