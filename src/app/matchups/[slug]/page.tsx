import { getDesk } from "@/lib/data";
import MatchupIntelligence from "@/components/matchup-intelligence";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = await getDesk();
  if (!d.games.some((g) => g.slug === slug)) notFound();
  return <MatchupIntelligence initial={d} slug={slug} />;
}
