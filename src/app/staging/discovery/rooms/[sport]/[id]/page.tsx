import { notFound } from "next/navigation";
import GameRoomClient from "@/components/game-room/game-room-client";
import { roomReference } from "@/lib/game-room";
import { discoveryStagingEnabled } from "@/lib/discovery/access";
import { consumerExperienceEnabled } from "@/lib/consumer-experience";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Game Intelligence | Vegas Quant",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sport: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!discoveryStagingEnabled(process.env)) notFound();
  const { sport, id } = await params;
  const search = await searchParams;
  const reference = roomReference(
    sport,
    id,
    typeof search.date === "string" ? search.date : "",
  );
  if (!reference) notFound();
  return (
    <GameRoomClient
      reference={reference}
      linkedPublications={
        process.env.STAGING_DISCOVERY_LINKED_PUBLICATIONS === "true"
      }
      homeHref={
        consumerExperienceEnabled(process.env) ? "/" : "/staging/discovery"
      }
      zoneHref="/community"
      fixtures={process.env.STAGING_DISCOVERY_FIXTURES === "true"}
      scenario={typeof search.scenario === "string" ? search.scenario : null}
    />
  );
}
