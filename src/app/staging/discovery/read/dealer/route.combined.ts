import type { NextRequest } from "next/server";
import { readStageConsumer } from "@/lib/stage-consumer-reader";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return readStageConsumer(request, "dealer");
}
