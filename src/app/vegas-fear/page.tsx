import { Suspense } from "react";
import VegasFear from "@/components/vegas-fear";

export const metadata = { title: "Vegas Fear | Market pressure | Vegas Quant" };

export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening Vegas Fear…</p>}>
      <VegasFear />
    </Suspense>
  );
}
