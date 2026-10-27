import { redirect } from "next/navigation";
import { Suspense } from "react";
import ResearchFeed from "@/components/research-feed";
export const metadata = { title: "The Zone | Vegas Quant" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (!Object.keys(query).length) redirect("/community");
  if (query.view === "contributors") redirect("/community#zone-contributors");
  return (
    <Suspense fallback={<p role="status">Loading The Zone…</p>}>
      <ResearchFeed />
    </Suspense>
  );
}
