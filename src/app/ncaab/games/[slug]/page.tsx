import SportGame from "@/components/sport/sport-game";
export const metadata = {
  title: "College basketball matchup | Vegas Quant",
  description:
    "College basketball matchup, FanDuel markets and reported injuries.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SportGame sport="ncaab" slug={slug} />;
}
