import Link from "next/link";

// One collapsed explainer, shared by Home and The Zone, so screens open with content.
export default function HowItWorks() {
  return (
    <details className="vq-how">
      <summary>
        <b>How it works</b>
        <small>Where picks live, game windows, betting terms</small>
      </summary>
      <div className="vq-how-body">
        <section>
          <h3>Where things live</h3>
          <p>
            <Link href="/">Home</Link>: the next kickoff and the Pick of the
            Day. <Link href="/feed">The Zone</Link>: game research, injury news
            and legs we like. <Link href="/community">Community</Link>: member
            slips and game talk. <Link href="/history">Records</Link>: every
            published outcome, wins and losses.
          </p>
        </section>
        <section>
          <h3>Game windows</h3>
          <p>
            On Sundays, research updates land at noon (early games), 3 PM (late
            afternoon) and 7 PM ET (evening). Each selection includes its case,
            risks and observed price.
          </p>
        </section>
        <section>
          <h3>Terms</h3>
          <p>
            <strong>Leg:</strong> one selection. <strong>Parlay:</strong>{" "}
            several selections combined into one wager, settled under your
            sportsbook’s rules. <strong>Watch target:</strong> an idea under
            review. <strong>Analyst-selected target:</strong> our qualitative
            opinion; it may have no verified sportsbook price.
          </p>
        </section>
        <p className="vq-how-note">
          A winning example does not guarantee the next outcome. Community posts
          are member opinions; The Zone contains Vegas Quant research.{" "}
          <Link href="/methodology">Methodology →</Link>
        </p>
      </div>
    </details>
  );
}
