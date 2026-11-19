import type { NextConfig } from "next";
import { stageBuildProfile } from "./src/lib/private-access-stage-config";

const profile = stageBuildProfile(process.env);
const stagingExtensions = ["stage.ts", "stage.tsx"];

const config: NextConfig = {
  env: { VQ_COMBINED_STAGE_BUILD: profile === "combined" ? "1" : "0" },
  // Next's custom route extensions trace a client manifest that route handlers
  // do not emit. Keep Vercel from packaging that nonexistent file. Page client
  // manifests and the standard build's tracing remain unchanged.
  ...(profile !== "standard" && {
    outputFileTracingExcludes: {
      "/api/staging/**": [
        ".next/server/app/**/route_client-reference-manifest.js",
      ],
      "/staging/**": [".next/server/app/**/route_client-reference-manifest.js"],
    },
  }),
  ...(profile === "gate" && { pageExtensions: stagingExtensions }),
  ...(profile === "combined" && {
    pageExtensions: [
      "combined.ts",
      ...stagingExtensions,
      "tsx",
      "ts",
      "jsx",
      "js",
    ],
  }),
};
export default config;
