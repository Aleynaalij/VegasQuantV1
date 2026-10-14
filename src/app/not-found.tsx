"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shell } from "@/components/ui";
export default function NotFound() {
  const nba = usePathname()?.startsWith("/nba") ?? false;
  return (
    <Shell active="missing" sport={nba ? "nba" : "nfl"}>
      <div className="fatal">
        <h1>That page isn’t on the board.</h1>
        <p>
          The link may be old or mistyped. Published picks and records are never
          removed, so try one of these instead.
        </p>
        <div className="fatal-actions">
          <Link className="primary" href="/">
            NFL desk
          </Link>
          <Link className="text-link" href="/nba">
            NBA desk →
          </Link>
          <Link className="text-link" href="/history">
            Records →
          </Link>
        </div>
      </div>
    </Shell>
  );
}
