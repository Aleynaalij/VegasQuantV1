import SportDesk from "@/components/sport/sport-desk";
import { Shell } from "@/components/ui";
export const metadata = {
  title: "NHL | Vegas Quant",
  description: "NHL games, FanDuel lines and Vegas Quant research.",
};
export default function Page() {
  return (
    <Shell active="home" sport="nhl">
      <SportDesk sport="nhl" />
    </Shell>
  );
}
