import VqSlots from "@/components/vq-slots";
import { Shell } from "@/components/ui";
import "./slots.css";
export const metadata = { title: "VQ Slots | Vegas Quant" };
export default function Page() {
  return (
    <Shell active="slots">
      <VqSlots />
    </Shell>
  );
}
