import { Panel, Shell } from "@/components/ui";
export default function Methodology() {
  return (
    <Shell>
      <div className="heading">
        <div>
          <span className="eyebrow">TRANSPARENCY</span>
          <h1>How we judge a decision</h1>
          <p>
            Research, execution and results are separate parts of the record.
          </p>
        </div>
      </div>
      <Panel title="What membership buys">
        <div className="notebook">
          <p>
            Timestamped NFL research, injury and market observations, the
            reasoning behind decisions, a permanent price history and personal
            challenge tracking. You are paying for analysis and tools; no wins,
            income or wagering opportunity are promised.
          </p>
          <p>
            Founder pricing: $5 per month until canceled, or $20 once for the
            remaining 2026 season, playoffs and Super Bowl. The season pass does
            not renew automatically.
          </p>
        </div>
      </Panel>
      <Panel title="Facts, inference and unknowns">
        <div className="notebook">
          <p>
            Observed odds belong to a named source and observation time. Injury
            and weather claims should retain source links. The analyst’s
            interpretation is identified separately. Missing data remains
            unknown; ticket and handle differences alone do not prove sharp
            action.
          </p>
          <p>
            A research target is provisional. Only an explicitly authorized
            official package becomes an official pick. The original selection,
            price and publication record stay locked.
          </p>
        </div>
      </Panel>
      <Panel title="Edge is an estimate">
        <div className="notebook">
          <p>
            Edge in percentage points is the supplied model probability minus
            the market implied probability. American odds imply |odds| / (|odds|
            + 100) for negative odds, or 100 / (odds + 100) for positive odds. A
            single quoted price includes bookmaker margin; it is not a no-vig
            fair probability.
          </p>
          <p>
            A defensible numeric estimate needs documented inputs, assumptions
            and model basis. We do not claim independent calibration, predictive
            accuracy or a validated positive expected return from a small
            record. Missing basis, uncertainty or an edge below 3 percentage
            points means WAIT or PASS.
          </p>
        </div>
      </Panel>
      <Panel title="Results and closing-line value">
        <div className="notebook">
          <p>
            All published picks, including losses, remain in the ledger. ROI is
            settled net profit divided by settled stake. Pushes and voids remain
            visible. Personal results use your actual entry and stake, not the
            published example.
          </p>
          <p>
            Closing-line value requires a verified closing observation for the
            same market and selection. Missing closing prices are excluded from
            averages, with coverage shown separately. Better numbers and better
            odds are tracked separately; key numbers such as 3 and 7 matter for
            NFL spreads.
          </p>
          <p>
            Process grades describe the analyst’s decision quality, not a
            promise about future results. A winning result alone does not
            validate the handicap.
          </p>
        </div>
      </Panel>
    </Shell>
  );
}
