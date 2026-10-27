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
  if (query.view === "contributors") {
    // Shared and older card links keep their target card.
    const ruby = typeof query.ruby === "string" ? query.ruby : "";
    redirect(
      ruby
        ? `/community?view=vip&ruby=${encodeURIComponent(ruby)}#ruby-${encodeURIComponent(ruby)}`
        : "/community?view=vip",
    );
  }
  return (
    <Suspense fallback={<p role="status">Loading The Zone…</p>}>
      <ResearchFeed />
    </Suspense>
  );
}
