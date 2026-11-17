import type { NextConfig } from "next";
import { stageBuildProfile } from "./src/lib/private-access-stage-config";

const profile = stageBuildProfile(process.env);
const stagingExtensions = ["stage.ts", "stage.tsx"];

const config: NextConfig = {
  env: { VQ_COMBINED_STAGE_BUILD: profile === "combined" ? "1" : "0" },
  ...(profile === "gate" && { pageExtensions: stagingExtensions }),
  ...(profile === "combined" && {
    pageExtensions: [...stagingExtensions, "tsx", "ts", "jsx", "js"],
  }),
};
export default config;
