import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Zone2Experience from "@/components/zone2/zone2-experience";
import {
  consumerExperienceEnabled,
  legacyLayDestination,
  type ConsumerQuery,
} from "@/lib/consumer-experience";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Zone 2.0 candidate | Vegas Quant",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ConsumerQuery>;
}) {
  if (!consumerExperienceEnabled(process.env)) notFound();
  const legacy = legacyLayDestination(await searchParams);
  if (legacy) redirect(legacy);
  return (
    <Suspense fallback={<p role="status">Opening The Zone…</p>}>
      <Zone2Experience basePath="/staging/discovery/zone" />
    </Suspense>
  );
}
