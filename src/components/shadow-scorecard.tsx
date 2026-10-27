"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { scorecardVerdict as verdict } from "@/lib/shadow-scorecard";

type Row = {
  market: string;
  week: number | null;
  props: number;
  games: number;
  brier_model: number;
  brier_market: number;
  brier_diff: number;
  brier_diff_se: number | null;
  disagree_props: number;
  disagree_model_right: number | null;
};
type Bin = {
  market: string;
  bin: number;
  props: number;
  mean_model: number;
  mean_market: number;
  hit_rate: number;
};

const pct = (v: number | null) =>
  v == null ? "–" : `${Math.round(Number(v) * 100)}%`;

/** Admin-only: the v0.3 shadow model scored against no-vig market prices on settled props. */
export default function ShadowScorecard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bins, setBins] = useState<Bin[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.rpc("admin_nfl_shadow_scorecard"),
      supabase.rpc("admin_nfl_shadow_calibration"),
    ]).then(([s, c]) => {
      if (!live) return;
      if (s.error || c.error) return setError(true);
      setRows((s.data as Row[]) || []);
      setBins((c.data as Bin[]) || []);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section
      className="panel shadow-scorecard"
      aria-labelledby="shadow-scorecard-title"
    >
      <h2 id="shadow-scorecard-title">Research model vs the market</h2>
      <p className="muted">
        Every settled prop the v0.3 research model priced before kickoff, scored
        against FanDuel’s no-vig price. Main lines only, one row per prop. Lower
        error is better. Research only: nothing here is approved or published.
      </p>
      {error && <p role="alert">Scorecard unavailable. Please retry.</p>}
      {!rows && !error && <p role="status">Loading scorecard…</p>}
      {rows && !rows.length && <p>No settled props yet.</p>}
      {rows &&
        [...new Set(rows.map((r) => r.market))].map((market) => (
          <div key={market} className="shadow-market">
            <h3>
              {market === "receiving"
                ? "Receiving yards"
                : market === "rushing"
                  ? "Rushing yards"
                  : market}
            </h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Props · games</th>
                    <th scope="col">Model error</th>
                    <th scope="col">Market error</th>
                    <th scope="col">Result</th>
                    <th scope="col">Big disagreements won</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.market === market)
                    .map((r) => (
                      <tr
                        key={`${market}-${r.week}`}
                        className={r.week == null ? "total" : ""}
                      >
                        <th scope="row">
                          {r.week == null ? "All weeks" : `Week ${r.week}`}
                        </th>
                        <td>
                          {r.props} · {r.games}
                        </td>
                        <td>{Number(r.brier_model).toFixed(4)}</td>
                        <td>{Number(r.brier_market).toFixed(4)}</td>
                        <td>
                          <strong>{verdict(r)}</strong>
                          <br />
                          <small>
                            {Number(r.brier_diff) > 0 ? "+" : ""}
                            {Number(r.brier_diff).toFixed(4)} ±{" "}
                            {r.brier_diff_se == null
                              ? "–"
                              : (2 * Number(r.brier_diff_se)).toFixed(4)}
                          </small>
                        </td>
                        <td>
                          {pct(r.disagree_model_right)} of {r.disagree_props}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      {bins.length > 0 && (
        <details>
          <summary>
            Calibration: when the model said X%, how often did it hit?
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Market</th>
                  <th scope="col">Model said</th>
                  <th scope="col">Props</th>
                  <th scope="col">Avg model</th>
                  <th scope="col">Avg market</th>
                  <th scope="col">Actually hit</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b) => (
                  <tr key={`${b.market}-${b.bin}`}>
                    <th scope="row">{b.market}</th>
                    <td>
                      {b.bin * 10}–{b.bin * 10 + 10}%
                    </td>
                    <td>{b.props}</td>
                    <td>{pct(b.mean_model)}</td>
                    <td>{pct(b.mean_market)}</td>
                    <td>{pct(b.hit_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="muted">
        Error is the Brier score. “Too close to call” means the gap is within
        two game-clustered standard errors. Big disagreements are props where
        the model and market differed by 10 points or more.
      </p>
    </section>
  );
}
