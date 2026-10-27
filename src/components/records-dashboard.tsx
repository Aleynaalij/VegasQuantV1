import Link from "next/link";
import { money, signedMoney, type Desk, type Pick } from "@/lib/domain";
import { performance } from "@/lib/performance";
const pct = (n: number | null, digits = 1) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
/** Sportsbook-style summary of the official record: KPIs, settled P/L curve and recent form. */
export default function RecordsDashboard({
  d,
  picks,
}: {
  d: Desk;
  picks: Pick[];
}) {
  const m = performance(d, picks);
  const values = [0, ...m.curve.map((x) => x.net)];
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values),
    range = high - low || 1;
  const W = 600,
    H = 150,
    pad = 12;
  const x = (i: number) =>
    pad + (i / Math.max(1, values.length - 1)) * (W - pad * 2);
  const y = (n: number) => pad + (1 - (n - low) / range) * (H - pad * 2);
  const line = values.map((n, i) => `${x(i)},${y(n)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(values.length - 1)},${y(0)}`;
  const up = m.net >= 0;
  const form = m.settled.slice(-10);
  return (
    <section className="records-dash" aria-label="Official record summary">
      <div className="records-kpis">
        <div>
          <small>Record</small>
          <strong>
            {m.wins}-{m.losses}
            {m.pushes ? `-${m.pushes}` : ""}
          </strong>
          <span>{m.pending} awaiting result</span>
        </div>
        <div>
          <small>Net P/L</small>
          <strong className={up ? "positive" : "negative"}>
            {signedMoney(m.net)}
          </strong>
          <span>
            {m.units > 0 ? "+" : ""}
            {m.units.toFixed(2)}u normalized
          </span>
        </div>
        <div>
          <small>ROI</small>
          <strong className={(m.roi ?? 0) >= 0 ? "positive" : "negative"}>
            {pct(m.roi)}
          </strong>
          <span>Settled stakes</span>
        </div>
        <div>
          <small>Closing line value</small>
          <strong
            className={
              m.avgClv === null ? "" : m.avgClv >= 0 ? "positive" : "negative"
            }
          >
            {pct(m.avgClv, 2)}
          </strong>
          <span>
            {m.clvCount
              ? `Beat the close ${Math.round(m.clvWinRate ?? 0)}% · ${m.clvCount} graded`
              : "Closing prices pending"}
          </span>
        </div>
      </div>
      <div className="records-chart">
        <div className="records-chart-head">
          <b>Settled profit / loss</b>
          <span>Max drawdown {money(m.drawdown)}</span>
        </div>
        {m.curve.length ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Cumulative settled profit and loss, currently ${signedMoney(m.net)} after ${m.curve.length} settled picks.`}
          >
            <defs>
              <linearGradient id="records-fill" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={up ? "#1ed883" : "#ff5468"}
                  stopOpacity=".35"
                />
                <stop
                  offset="100%"
                  stopColor={up ? "#1ed883" : "#ff5468"}
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <line
              x1={pad}
              x2={W - pad}
              y1={y(0)}
              y2={y(0)}
              stroke="currentColor"
              strokeOpacity=".2"
              strokeDasharray="4 4"
            />
            <polygon points={area} fill="url(#records-fill)" />
            <polyline
              points={line}
              fill="none"
              stroke={up ? "#1ed883" : "#ff5468"}
              strokeWidth="3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <p className="records-empty">
            The curve starts when the first official result is recorded.
          </p>
        )}
      </div>
      <div className="records-proof" aria-label="Sample and consistency">
        <div>
          <small>Sample</small>
          <strong>{m.wins + m.losses} decided</strong>
          <span>
            {m.winRange
              ? `Win rate likely ${Math.round(m.winRange[0])}–${Math.round(m.winRange[1])}% (95% range)`
              : "No decided picks yet"}
          </span>
        </div>
        <div>
          <small>Worst run</small>
          <strong>
            {m.streaks.longestLoss}{" "}
            {m.streaks.longestLoss === 1 ? "loss" : "losses"}
          </strong>
          <span>
            Best run: {m.streaks.longestWin}{" "}
            {m.streaks.longestWin === 1 ? "win" : "wins"}
          </span>
        </div>
        <div>
          <small>Graded</small>
          <strong>
            {m.gradeLagHours === null ? "—" : `${m.gradeLagHours.toFixed(1)}h`}
          </strong>
          <span>Median time from kickoff to result</span>
        </div>
      </div>
      {form.length > 0 && (
        <div className="records-form" aria-label="Recent results, oldest first">
          <small>Recent form</small>
          {form.map((s) => (
            <span
              key={s.p.id}
              className={`form-${s.r!.result.toLowerCase()}`}
              title={`${s.p.selection} · ${s.r!.result} · ${signedMoney(s.r!.profit_cents)}`}
            >
              {s.r!.result[0]}
            </span>
          ))}
          <Link href="/performance">Full performance →</Link>
        </div>
      )}
    </section>
  );
}
