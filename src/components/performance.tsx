"use client";
import { useState } from "react";
import Link from "next/link";
import {
  classifications,
  money,
  signedMoney,
  time,
  type Desk,
} from "@/lib/domain";
import { performance } from "@/lib/performance";
import { Panel, Stat, Empty } from "./ui";
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`);
export default function Performance({ desk: d }: { desk: Desk }) {
  const [scope, setScope] = useState("All"),
    [market, setMarket] = useState("All");
  const picks = d.picks.filter(
    (p) =>
      (market === "All" || p.market === market) &&
      (scope === "All" ||
        (scope === "Standalone"
          ? !p.stage_id
          : d.stages.some(
              (s) => s.id === p.stage_id && s.challenge_id === scope,
            ))),
  );
  const m = performance(d, picks),
    values = [0, ...m.curve.map((x) => x.net)],
    low = Math.min(...values),
    high = Math.max(...values),
    range = high - low || 1;
  const y = (n: number) => 135 - ((n - low) / range) * 110;
  const points = values
    .map((n, i) => `${15 + (i / Math.max(1, values.length - 1)) * 570},${y(n)}`)
    .join(" ");
  return (
    <div className="performance-page">
      <div className="performance-filters">
        <label className="field">
          Record scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option>All</option>
            <option value="Standalone">Standalone only</option>
            {d.challenges.map((c) => (
              <option value={c.id} key={c.id}>
                Challenge #{c.number}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Market
          <select value={market} onChange={(e) => setMarket(e.target.value)}>
            {["All", "Side", "Moneyline", "Total", "Player Prop"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        Official Vegas Quant record. Your personal entries and bankroll remain
        separate. {picks.length} published · {m.settled.length} settled ·{" "}
        {m.pending} awaiting result.
      </p>
      <section className="stats ledger-stats">
        <Stat
          label="Record"
          value={`${m.wins} W / ${m.losses} L`}
          note={`${m.pushes} pushes · ${m.voids} voids`}
        />
        <Stat
          label="Win rate"
          value={pct(m.winRate)}
          note="Wins ÷ (wins + losses)"
        />
        <Stat label="Settled ROI" value={pct(m.roi)} />
        <Stat
          label="Net P/L"
          value={signedMoney(m.net)}
          tone={m.net < 0 ? "negative" : "positive"}
        />
        <Stat
          label="Normalized units"
          value={`${m.units > 0 ? "+" : ""}${m.units.toFixed(2)}u`}
          note="Each entry’s stake = 1u"
        />
        <Stat
          label="Maximum drawdown"
          value={money(m.drawdown)}
          note="Settled P/L peak to trough"
        />
        <Stat label="Average stated edge" value={pct(m.avgEdge)} />
        <Stat
          label="Average confidence"
          value={
            m.avgConfidence === null ? "—" : `${m.avgConfidence.toFixed(1)}/10`
          }
        />
        <Stat
          label="Average price CLV"
          value={pct(m.avgClv)}
          note={`${m.clvCount} comparable entries`}
        />
        <Stat label="Positive price CLV" value={pct(m.clvWinRate)} />
        <Stat
          label="Average process grade"
          value={m.avgGrade === null ? "—" : `${m.avgGrade.toFixed(2)}/4`}
          note={`${m.graded} reviewed picks`}
        />
        <Stat
          label="Closing-line coverage"
          value={`${m.closingCount}/${picks.length}`}
          note={`${m.entryCount} actual entries recorded`}
        />
      </section>
      <Panel title="Settled profit / loss">
        {!m.curve.length ? (
          <Empty title="Results are still pending">
            The curve begins when an official result is recorded. Open picks are
            not wins or losses.
          </Empty>
        ) : (
          <div className="performance-curve">
            <svg
              viewBox="0 0 600 160"
              role="img"
              aria-label={`Cumulative settled profit and loss. Current ${signedMoney(m.net)}; maximum drawdown ${money(m.drawdown)}.`}
            >
              <line
                x1="15"
                x2="585"
                y1={y(0)}
                y2={y(0)}
                stroke="currentColor"
                opacity=".25"
              />
              <polyline
                points={points}
                fill="none"
                stroke="var(--green, #72dbb4)"
                strokeWidth="3"
              />
            </svg>
            <div className="performance-range">
              <span>Start: $0 P/L</span>
              <strong>{signedMoney(m.net)}</strong>
            </div>
            <details>
              <summary>View settled results</summary>
              {m.curve.map((x, i) => (
                <p key={i}>
                  {time(x.at)} · {x.selection} · cumulative {signedMoney(x.net)}
                </p>
              ))}
            </details>
          </div>
        )}
      </Panel>
      <Panel title="By market">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["Market", "Settled", "Record", "P/L", "ROI", "Price CLV"].map(
                  (x) => (
                    <th key={x}>{x}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {["Side", "Moneyline", "Total", "Player Prop"].map((v) => {
                const group = picks.filter((p) => p.market === v),
                  s = performance(d, group);
                return (
                  <tr key={v}>
                    <td>{v}</td>
                    <td>
                      {s.settled.length}/{group.length}
                    </td>
                    <td>
                      {s.wins}–{s.losses}
                    </td>
                    <td>{signedMoney(s.net)}</td>
                    <td>{pct(s.roi)}</td>
                    <td>
                      {pct(s.avgClv)} ({s.clvCount})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Decision quality">
        <div className="notebook">
          {classifications.map((c) => (
            <p key={c}>
              <strong>
                {m.rows.filter((x) => x.review?.classification === c).length}
              </strong>{" "}
              · {c}
            </p>
          ))}
          <p className="muted">
            {picks.length - m.graded} picks have no process review yet.
          </p>
        </div>
      </Panel>
      <details className="admin-section">
        <summary>How these numbers work</summary>
        <div className="notebook">
          <p>
            ROI uses settled net profit divided by settled stakes, excluding
            voids. Win rate excludes pushes, voids, and pending picks. Units sum
            each settled result’s profit divided by its own stake; this
            normalizes different stake sizes.
          </p>
          <p>
            Price CLV compares actual entry odds with closing odds only when the
            line is identical. Different numbers are not treated as comparable
            prices. Positive-CLV rate includes zero-CLV observations in its
            denominator. Line CLV remains in the ledger.
          </p>
          <p>
            Process averages use the latest saved review for each pick: A = 4, B
            = 3, C = 2, D = 1, F = 0. Stated edge and confidence are analyst
            inputs, not measured returns. A small sample does not establish
            predictive accuracy.
          </p>
        </div>
      </details>
      <Link className="secondary" href="/history">
        Open the full ledger →
      </Link>
    </div>
  );
}
