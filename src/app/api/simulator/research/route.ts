import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { requestUser } from "@/lib/billing-server";
import { parseResearchRun } from "@/lib/game-sim/research";
import manifest from "../../../../../research/game_sim/artifacts/v0.2.10/manifest.json";

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
    const readVerified = async (name: "replay.json.gz" | "calibration.json.gz") => {
      const bytes = await readFile(path.join(process.cwd(), "research/game_sim/artifacts/v0.2.10", name));
      if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[name].sha256)
        throw new Error("Artifact integrity");
      const raw = gunzipSync(bytes, { maxOutputLength: 2_000_000 });
      if (createHash("sha256").update(raw).digest("hex") !== manifest.files[name].canonical_sha256)
        throw new Error("Canonical artifact integrity");
      return JSON.parse(raw.toString("utf8"));
    };
    const [run, calibration] = await Promise.all([readVerified("replay.json.gz"), readVerified("calibration.json.gz")]);
    if (run.artifact_sha256 !== manifest.model_sha256 || calibration.model_artifact_sha256 !== manifest.model_sha256)
      throw new Error("Model identity mismatch");
    if (!parseResearchRun(run).ok) throw new Error("Artifact contract");
    return reply({ run, calibration });
  } catch {
    return reply(
      { error: "Research artifact could not be verified. Please retry." },
      503,
    );
  }
}
