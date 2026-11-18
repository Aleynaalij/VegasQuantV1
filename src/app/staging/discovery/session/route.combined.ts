import type { NextRequest } from "next/server";
import { stageViewerSession } from "@/lib/stage-viewer-session";
export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) => stageViewerSession(request);
export const POST = (request: NextRequest) => stageViewerSession(request);
