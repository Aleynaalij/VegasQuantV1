import { Suspense } from "react";
import { notFound } from "next/navigation";
import Discovery from "@/components/discovery/discovery";
import { discoveryStagingEnabled } from "@/lib/discovery/access";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Discovery staging | Vegas Quant",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (!discoveryStagingEnabled(process.env)) notFound();
  return (
    <Suspense fallback={<p role="status">Opening discovery…</p>}>
      <Discovery
        fixtures={process.env.STAGING_DISCOVERY_FIXTURES === "true"}
        linkedPublications={
          process.env.STAGING_DISCOVERY_LINKED_PUBLICATIONS === "true"
        }
      />
    </Suspense>
  );
}
