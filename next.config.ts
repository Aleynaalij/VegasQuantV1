import type { NextConfig } from "next";
import { isFearTesterDiagnosticPreview } from "./src/preview/fear-tester-diagnostic-environment";

const config: NextConfig = isFearTesterDiagnosticPreview()
  ? { pageExtensions: ["preview.tsx", "tsx", "ts", "jsx", "js"] }
  : {};

export default config;
