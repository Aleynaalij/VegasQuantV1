import Link from "next/link";
import { ArrowUpRight, CalendarDays, Radio, ShieldCheck } from "lucide-react";
import type { Game } from "@/lib/domain";
export default function HomeBrief({ games }: { games: Game[] }) {
  const upcoming = games
    .filter(
      (g) =>
        Date.parse(g.kickoff) > Date.now() &&
        Date.parse(g.kickoff) <= Date.now() + 7 * 86400000,
    )
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const next = upcoming[0];
  return (
    <header className="home-brief">
      <div className="desk-overline">
        <span className="status-dot" /> THE SPORTS DESK <span>NFL</span>
      </div>
      <div className="desk-title-row">
        <div>
          <h1>
            Your game day.
            <br />
            <em>The Vegas Quant read.</em>
          </h1>
          <p>Find the play. Understand the case. Keep the record.</p>
        </div>
        <div className="desk-symbol" aria-hidden="true">
          Q<span>+</span>
        </div>
      </div>
      <nav className="desk-shortcuts" aria-label="Sports desk shortcuts">
        <Link href="/matchups">
          <CalendarDays size={18} />
          <span>
            <b>{upcoming.length} games this week</b>
            <small>
              {next
                ? new Date(next.kickoff).toLocaleDateString("en-US", {
                    timeZone: "America/New_York",
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }) + " · next kickoff"
                : "Explore the NFL slate"}
            </small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
        <Link href="/feed">
          <Radio size={18} />
          <span>
            <b>Latest intelligence</b>
            <small>What changed & why</small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
        <Link href="/history">
          <ShieldCheck size={18} />
          <span>
            <b>The full record</b>
            <small>Every published outcome</small>
          </span>
          <ArrowUpRight size={16} />
        </Link>
      </nav>
    </header>
  );
}
