import type { NextConfig } from "next";

const diagnostic =
  process.env.VERCEL_ENV === "preview" &&
  process.env.VQ_FEAR_TESTER_DIAGNOSTIC === "1";

const config: NextConfig = diagnostic
  ? { pageExtensions: ["preview.tsx", "tsx", "ts", "jsx", "js"] }
  : {};

export default config;
