import type { NextConfig } from "next";
import { isPrivateAccessCandidate, privateAccessConfig } from "./src/lib/private-access-stage-config";

const stage = isPrivateAccessCandidate(process.env);
if (stage && !privateAccessConfig(process.env)) {
  throw new Error("Private access staging requires an isolated environment before build or start.");
}

// The stage build contains only the acceptance routes. A regular build never
// recognizes route.stage.ts as a route, and stage cannot run unrelated APIs.
const config: NextConfig = stage ? { pageExtensions: ["stage.ts", "stage.tsx"] } : {};
export default config;
