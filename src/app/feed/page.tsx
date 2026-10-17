import { Suspense } from "react";
import ResearchFeed from "@/components/research-feed";
export const metadata = { title: "The Zone | Vegas Quant" };
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading The Zone…</p>}>
      <ResearchFeed />
    </Suspense>
  );
}
