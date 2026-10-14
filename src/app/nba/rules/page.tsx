import Link from "next/link";
import { Shell } from "@/components/ui";
import { bibleRules, ruleGroups } from "@/lib/nba-rules";
export const metadata = {
  title: "NBA rulebook | Vegas Quant",
  description:
    "The 40 commandments behind every Vegas Quant NBA play and pass, from The NBA Betting Bible 2026-27.",
};
export default function Page() {
  return (
    <Shell active="rules" sport="nba">
      <div className="nba-desk">
        <section className="nba-hero">
          <span className="nba-eyebrow">THE NBA BETTING BIBLE · 2026-27</span>
          <h1>The Commandments.</h1>
          <p>
            Forty rules decide every NBA bet and every pass. Each play and pass
            on the NBA desk cites the rule IDs behind it, so the reasoning can
            be audited.
          </p>
          <nav className="rule-jump" aria-label="Rule groups">
            {ruleGroups.map((g) => (
              <a key={g.id} href={`#group-${g.id}`}>
                <b>{g.id}</b> {g.title}
              </a>
            ))}
          </nav>
        </section>
        {ruleGroups.map((g) => (
          <section
            key={g.id}
            id={`group-${g.id}`}
            className="panel rule-group"
            aria-labelledby={`group-${g.id}-title`}
          >
            <div className="panel-head">
              <h2 id={`group-${g.id}-title`}>
                {g.id}. {g.title}
              </h2>
            </div>
            <ol className="rule-list">
              {bibleRules
                .filter((rule) => rule.group === g.id)
                .map((rule) => (
                  <li key={rule.id} id={rule.id}>
                    <span className="rule-id">{rule.id}</span>
                    <div>
                      <strong>{rule.title}</strong>
                      <p>{rule.text}</p>
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        ))}
        <p className="rule-source">
          Source: The NBA Betting Bible — 2026-27 Edition, Part II. Rules are
          summarized; the full text and the Vegas Quant operating addendum
          (VQ-NBA-01 to VQ-NBA-15) live in the research library. Nothing here is
          legal, tax or financial advice.{" "}
          <Link href="/nba">Back to the NBA desk →</Link>
        </p>
      </div>
    </Shell>
  );
}
