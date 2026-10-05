import { Panel, Shell } from "@/components/ui";
import validation from "../../../research/probability/artifacts/v0.3/validation.json";
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
      <Panel title="Probability engine · Research testing">
        <div className="notebook">
          <p>
            We forecast running-back rushing yards and RB, WR and TE receiving
            yards using historical workload, efficiency and opponent context.
            We trained on 2022, calibrated on 2023 and tested the unchanged model
            on 2025. Earlier 2024 results remain in the research record.
          </p>
          <p>
            The model&apos;s Brier score was {validation.markets.rushing.model.brier.toFixed(3)}
            {" "}for {validation.markets.rushing.test_player_games} rushing player-games
            and {validation.markets.receiving.model.brier.toFixed(3)} for
            {" "}{validation.markets.receiving.test_player_games} receiving player-games.
            Lower scores indicate better probability forecasts. Historical
            hit-rate baselines scored {validation.markets.rushing.empirical_player_baseline.brier.toFixed(3)}
            {" "}and {validation.markets.receiving.empirical_player_baseline.brier.toFixed(3)}, respectively.
          </p>
          <p>
            These tests used fixed yard thresholds, not historical sportsbook
            offers. They do not establish profitable bets or a verified edge.
            Live qualification still requires current player and role checks,
            executable prices and prospective evidence against the market.
            Touchdowns, parlays and game sides are outside this model&apos;s scope.
          </p>
          <a href="https://github.com/Aleynaalij/VegasQuantV1/tree/main/research/probability"
            target="_blank" rel="noopener noreferrer">Read the model methods and validation →</a>
        </div>
      </Panel>
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
      <Panel title="Five stages, flexible windows">
        <div className="notebook">
          <p>
            Thursday night, Sunday early, Sunday late, Sunday night and Monday
            night are preferred windows, not deadlines. Five qualifying stages
            may take longer. No qualifying edge means WAIT or PASS.
          </p>
          <p>
            Only settled, available sportsbook funds roll forward. If a payout
            has not cleared, pause your personal run using Payout pending on
            Home. A missed window is not a loss. Confirm Funds cleared when the
            money is available, then wait for the next qualifying pregame
            official play at its published entry limits. No extra deposit or
            live wager to bridge the gap.
          </p>
          <p>
            Results and payout availability are separate. We cannot verify your
            sportsbook balance; payout status is self-reported and timestamped.
            Pausing or resuming never changes a published pick, grades a result,
            or adds money.
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
