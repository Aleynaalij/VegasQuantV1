import { Suspense } from "react";
import CommunityFeed from "@/components/community-feed";
export const metadata = {
  title: "Community | Vegas Quant",
  description: "Member slips, game discussion and transparent results.",
};
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading Community…</p>}>
      <CommunityFeed />
    </Suspense>
  );
}
