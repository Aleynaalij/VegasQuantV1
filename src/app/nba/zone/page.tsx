import NbaDesk from "@/components/nba-desk";
export const metadata = {
  title: "NBA | Vegas Quant",
  description: "Vegas Quant basketball research preparation.",
};
export default function Page() {
  return <NbaDesk view="feed" />;
}
