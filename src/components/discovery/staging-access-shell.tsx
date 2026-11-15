"use client";
import { usePathname } from "next/navigation";
import { discoveryShellSuspended } from "@/lib/discovery/access";
import type { ReactNode } from "react";

/** Deny-only shell suspension. This does not authenticate or authorize anyone.
 * enabled comes from the existing server-only non-production staging gate.
 * Unmounting the normal shell invokes its existing subscription cleanup.
 */
export default function StagingAccessShell({
  enabled,
  deniedContent,
  children,
}: {
  enabled: boolean;
  deniedContent: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  return discoveryShellSuspended(enabled, path) ? deniedContent : children;
}
