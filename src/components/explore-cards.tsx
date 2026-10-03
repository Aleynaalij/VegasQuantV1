import Link from "next/link";
import { ArrowUpRight, Radio, BookOpen, History } from "lucide-react";
export default function ExploreCards() {
  return (
    <nav className="explore-cards" aria-label="Explore Vegas Quant">
      <Link href="/feed">
        <Radio size={21} />
        <span>
          <strong>Catch up</strong>
          <small>The latest from the analyst</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
      <Link href="/matchups">
        <BookOpen size={21} />
        <span>
          <strong>Scout the slate</strong>
          <small>Every matchup, one place</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
      <Link href="/history">
        <History size={21} />
        <span>
          <strong>See the record</strong>
          <small>Every outcome stays on record</small>
        </span>
        <ArrowUpRight size={17} />
      </Link>
    </nav>
  );
}
