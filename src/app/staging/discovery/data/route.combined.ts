import type { NextRequest } from "next/server";
import { stageDataGateway } from "@/lib/stage-data-gateway";
export const dynamic = "force-dynamic";
export const POST = (request: NextRequest) => stageDataGateway(request);
