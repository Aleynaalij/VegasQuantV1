"use client";
import { usePathname } from "next/navigation";
import { FrankAnniversaryCorner } from "./frank-anniversary";

/**
 * Owner (Oct 31): Frank's surprise greets him as soon as he signs in, before he can see NHL in the
 * sport chips. Mounted on every page; the server answers "hidden" for everyone but Frank. The NHL
 * desk is the surprise's destination (it plays the fireworks), so the invitation never mounts there.
 */
export default function FrankAnniversaryGate() {
  const path = usePathname() || "";
  if (path === "/nhl" || path.startsWith("/nhl/")) return null;
  return <FrankAnniversaryCorner />;
}
