import { OperationsQueue } from "@/components/operations-support";
import { Shell } from "@/components/ui";

export const metadata = {
  title: "Operations | Vegas Quant",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Shell active="admin">
      <OperationsQueue />
    </Shell>
  );
}
