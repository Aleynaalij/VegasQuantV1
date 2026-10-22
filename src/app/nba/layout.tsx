import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NBA_PAUSED, NBA_PAUSED_HREF } from "@/lib/nba-paused";

// While NBA is paused every /nba page sends visitors home, where the coming-soon note opens.
export default function NbaLayout({ children }: { children: ReactNode }) {
  if (NBA_PAUSED) redirect(NBA_PAUSED_HREF);
  return children;
}
