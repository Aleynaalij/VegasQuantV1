import Link from "next/link";
export default function ZoneNav({ active = "Latest" }: { active?: string }) {
  return (
    <>
      <nav className="zone-views" aria-label="Zone views">
        {[
          ["Latest", "/feed"],
          ["Games", "/matchups"],
          ["Legs", "/feed?view=legs"],
          ["Injury watch", "/feed?view=injury"],
        ].map(([label, href]) => (
          <a
            key={label}
            href={href}
            aria-current={active === label ? "page" : undefined}
            className={active === label ? "selected" : ""}
          >
            {label}
          </a>
        ))}
      </nav>
      <p className="zone-guide">
        Start with a game, read the case, then join the conversation.{" "}
        <Link href="/community">Meet the community →</Link>
      </p>
      <details className="zone-glossary">
        <summary>New to betting? A quick guide</summary>
        <p>
          <strong>Leg:</strong> one selection. <strong>Parlay:</strong> several
          selections combined into one wager, settled under your sportsbook’s
          rules.
        </p>
        <p>
          <strong>Watch target:</strong> an idea under review.{" "}
          <strong>Analyst-selected target:</strong> our qualitative opinion; it
          may have no verified sportsbook price. Read the risk and sources
          before deciding.
        </p>
        <p>
          A winning example does not guarantee the next outcome. Community posts
          are member opinions; The Zone contains Vegas Quant research.
        </p>
      </details>
    </>
  );
}
