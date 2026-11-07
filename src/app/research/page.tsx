import { Suspense } from "react";
import ResearchHub from "@/components/research-hub";
export const metadata = {
  title: "Research lounge | Vegas Quant",
  description:
    "Explore sourced research, availability and market observations for the events Vegas Quant tracks.",
};
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening the Research lounge…</p>}>
      <ResearchHub />
    </Suspense>
  );
}
