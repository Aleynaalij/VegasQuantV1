import Link from "next/link";
import { Shell } from "@/components/ui";
export const metadata = { title: "Page not found | Vegas Quant" };
export default function NotFound() {
  return (
    <Shell active="missing">
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
