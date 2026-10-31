import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SPORTS } from "@/lib/sports";

// The College basketball desk opens once its data and screens ship (#166).
export default function Layout({ children }: { children: ReactNode }) {
  if (!SPORTS.ncaab.live) notFound();
  return children;
}
