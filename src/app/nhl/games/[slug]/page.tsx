import SportGame from "@/components/sport/sport-game";
export const metadata = {
  title: "NHL matchup | Vegas Quant",
  description: "NHL matchup, FanDuel markets and reported injuries.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <SportGame sport="nhl" slug={slug} />;
}
