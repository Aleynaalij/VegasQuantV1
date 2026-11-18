import { NextRequest } from "next/server";
import { stageMatchupSheet } from "@/lib/stage-matchup-sheet";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: NextRequest, context: { params: Promise<{ id: string }> }) => stageMatchupSheet(request, context);
