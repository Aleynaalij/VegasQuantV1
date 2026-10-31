import SportRecords from "@/components/sport/sport-records";
export const metadata = {
  title: "College basketball record | Vegas Quant",
  description:
    "Vegas Quant's published College basketball selections and results.",
};
export default function Page() {
  return <SportRecords sport="ncaab" />;
}
