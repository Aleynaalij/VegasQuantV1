import SportRecords from "@/components/sport/sport-records";
export const metadata = {
  title: "NBA record | Vegas Quant",
  description: "Published NBA selections graded from confirmed results.",
};
export default function Page() {
  return <SportRecords sport="nba" />;
}
