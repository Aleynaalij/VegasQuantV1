import NbaDesk from "@/components/nba-desk";
export const metadata = {
  title: "NBA | Vegas Quant",
  description: "NBA games, observed FanDuel lines and Vegas Quant selections.",
};
export default function Page() {
  return <NbaDesk view="home" />;
}
