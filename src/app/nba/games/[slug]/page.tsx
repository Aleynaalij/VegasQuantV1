import NbaGameDetail from "@/components/nba-game-detail";
export const metadata = {
  title: "NBA matchup | Vegas Quant",
  description: "NBA matchup, sportsbook snapshots and recorded player form.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NbaGameDetail slug={slug} />;
}
