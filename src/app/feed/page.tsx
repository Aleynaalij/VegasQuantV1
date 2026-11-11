import { redirect } from "next/navigation";
import { Suspense } from "react";
import ResearchFeed from "@/components/research-feed";
import ResearchEntry from "@/components/research-entry";
import PublishedLegBoard from "@/components/published-leg-board";
import { Shell } from "@/components/ui";
import Link from "next/link";
export const metadata = { title: "Published research | Vegas Quant" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // The lobby Research action keeps its old URL; saved publication links keep their original target.
  if (query.view === "latest" && !query.release)
    return (
      <Suspense fallback={<p role="status">Opening research…</p>}>
        <ResearchEntry />
      </Suspense>
    );
  if (query.view === "selection") {
    const key = typeof query.leg === "string" ? query.leg : "";
    return (
      <Shell active="feed">
        <Link href="/parlays/tailed" className="text-link">
          ← Back to Tailed
        </Link>
        <PublishedLegBoard key={key} selectionKey={key} />
      </Shell>
    );
  }
  // The Zone is one feed now; big injury news is posted to it, so the injury view is retired.
  if (!Object.keys(query).length || query.view === "injury")
    redirect("/community");
  if (query.view === "contributors") {
    // Shared and older card links keep their target card.
    const ruby = typeof query.ruby === "string" ? query.ruby : "";
    redirect(
      ruby
        ? `/community?ruby=${encodeURIComponent(ruby)}#ruby-${encodeURIComponent(ruby)}`
        : "/community",
    );
  }
  return (
    <Suspense fallback={<p role="status">Loading published research…</p>}>
      <ResearchFeed />
    </Suspense>
  );
}
