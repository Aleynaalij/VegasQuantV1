import NbaMatchupSheet from "@/components/nba-matchup-sheet";

export const metadata = {
  title: "NBA Matchup Cheat Sheet | Vegas Quant",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NbaMatchupSheet id={id} />;
}
