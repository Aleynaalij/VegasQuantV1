import SportRecords from "@/components/sport/sport-records";
export const metadata = {
  title: "NHL record | Vegas Quant",
  description: "Vegas Quant's published NHL selections and results.",
};
export default function Page() {
  return <SportRecords sport="nhl" />;
}
