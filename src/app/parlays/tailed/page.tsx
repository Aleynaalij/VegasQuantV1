import { Shell } from "@/components/ui";
import TailedLays from "@/components/tailed-lays";
import "@/app/tailed-lays.css";
export const metadata = { title: "Tailed · Your lays | Vegas Quant" };
/** Your lays → Tailed: published picks and parlays the member tailed (separate from saved lays). */
export default function Page() {
  return (
    <Shell active="lays">
      <TailedLays />
    </Shell>
  );
}
