import { redirect } from "next/navigation";
import { Suspense } from "react";
import CommunityFeed from "@/components/community-feed";
export const metadata = {
  title: "The Zone | Vegas Quant",
  description: "Member slips, game discussion and transparent results.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (Object.hasOwn(query, "build") || Object.hasOwn(query, "saved")) {
    const saved = typeof query.saved === "string" ? query.saved : "";
    redirect(
      saved
        ? `/parlays?saved=${encodeURIComponent(saved)}#my-parlay-${encodeURIComponent(saved)}`
        : "/parlays",
    );
  }
  return (
    <Suspense fallback={<p role="status">Loading Community…</p>}>
      <CommunityFeed />
    </Suspense>
  );
}
