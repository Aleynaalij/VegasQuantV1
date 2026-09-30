import { getDesk } from "@/lib/data";
import DeskApp from "@/components/desk";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Game({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = await getDesk();
  if (!d.games.find((g) => g.slug === slug)) notFound();
  return <DeskApp initial={d} page="game" gameSlug={slug} />;
}
