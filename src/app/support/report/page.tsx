import { MalfunctionReport } from "@/components/operations-support";
import { Shell } from "@/components/ui";

export const metadata = { title: "Report a malfunction | Vegas Quant" };

export default function Page() {
  return (
    <Shell active="methodology">
      <MalfunctionReport />
    </Shell>
  );
}
