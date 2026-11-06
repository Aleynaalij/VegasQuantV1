import Link from "next/link";
import AdminOnly from "./admin-only";

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
            <Link href="/">Home</Link>: every sport and tonight’s games.{" "}
            <Link href="/nfl">NFL desk</Link> and the other sport desks: the
            slate, game research and player props.{" "}
            <Link href="/feed?view=latest">Published research</Link>: the Pick
            of the Day and the legs we like, each with its case, risks and
            observed price. <Link href="/community">The Zone</Link>: member
            posts, stories and game talk.{" "}
            <AdminOnly>
              <Link href="/history">Records</Link>: every published outcome,
              wins and losses.
            </AdminOnly>
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
          A winning example does not guarantee the next outcome. Posts in The
          Zone are member opinions; published research is Vegas Quant’s.{" "}
          <Link href="/methodology">Methodology →</Link>
        </p>
      </div>
    </details>
  );
}
