"use client";
import type { ReactNode } from "react";
import { useIsAdmin } from "@/lib/use-admin";

/** Renders its children only for a verified admin (e.g. links to the private Records pages). */
export default function AdminOnly({ children }: { children: ReactNode }) {
  return useIsAdmin() ? <>{children}</> : null;
}
