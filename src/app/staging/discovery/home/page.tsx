import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import HomeExperience from "@/components/consumer/home-experience";
import { getDeskOrEmpty } from "@/lib/data";
import {
  consumerExperienceEnabled,
  legacyGameDestination,
  type ConsumerQuery,
} from "@/lib/consumer-experience";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Home 2.0 candidate | Vegas Quant",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ConsumerQuery>;
}) {
  if (!consumerExperienceEnabled(process.env)) notFound();
  const legacy = legacyGameDestination(await searchParams);
  if (legacy) permanentRedirect(legacy);
  const desk = await getDeskOrEmpty();
  return (
    <Suspense fallback={<p role="status">Opening Home…</p>}>
      <HomeExperience
        nflGames={desk.games}
        nflUnavailable={Boolean(desk.unavailable)}
        zoneHref="/staging/discovery/zone"
      />
    </Suspense>
  );
}
