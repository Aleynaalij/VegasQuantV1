import SportDesk from "@/components/sport/sport-desk";
import { Shell } from "@/components/ui";
export const metadata = {
  title: "College basketball | Vegas Quant",
  description:
    "College basketball games, FanDuel lines and Vegas Quant research.",
};
export default function Page() {
  return (
    <Shell active="home" sport="ncaab">
      <SportDesk sport="ncaab" />
    </Shell>
  );
}
