import Link from "next/link";
import { BookMarked } from "lucide-react";
import type { BibleRule } from "@/lib/nba-rules";
/** Bible rules cited by a play or a pass, each linking to its entry in the NBA rulebook. */
export default function RuleChips({
  rules,
  label = "Bible rules cited",
}: {
  rules: BibleRule[];
  label?: string;
}) {
  if (!rules.length) return null;
  return (
    <div className="rule-chips" aria-label={label}>
      <span className="rule-chips-label">
        <BookMarked size={14} aria-hidden="true" /> {label}
      </span>
      {rules.map((rule) => (
        <Link
          key={rule.id}
          href={`/nba/rules#${rule.id}`}
          title={`${rule.title}. ${rule.text}`}
        >
          <b>{rule.id}</b> {rule.title}
        </Link>
      ))}
    </div>
  );
}
