import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { requestUser } from "@/lib/billing-server";
import { parseResearchRun } from "@/lib/game-sim/research";
import manifest from "../../../../../research/game_sim/artifacts/v0.1.1/manifest.json";
import calibration from "../../../../../research/game_sim/artifacts/v0.1.1/calibration-summary.json";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: object, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
export async function GET(req: Request) {
  try {
    const auth = await requestUser(req);
    if (!auth) return reply({ error: "Sign in required." }, 401);
    const admin = await auth.db.rpc("is_admin");
    if (admin.error || admin.data !== true)
      return reply({ error: "Admin research access required." }, 403);
    const bytes = await readFile(
      path.join(
        process.cwd(),
        "research/game_sim/artifacts/v0.1.1/research-render.json.gz",
      ),
    );
    if (
      createHash("sha256").update(bytes).digest("hex") !==
      manifest.research_artifacts["research-render.json.gz"]
    )
      throw new Error("Artifact integrity");
    const run = JSON.parse(
      gunzipSync(bytes, { maxOutputLength: 2_000_000 }).toString("utf8"),
    );
    if (!parseResearchRun(run).ok) throw new Error("Artifact contract");
    return reply({ run, calibration });
  } catch {
    return reply(
      { error: "Research artifact could not be verified. Please retry." },
      503,
    );
  }
}
