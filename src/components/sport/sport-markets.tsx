import { americanPrice } from "@/lib/home-props";
import type { SportPage } from "@/lib/sport-contract";
import { gameMarkets, marketLine } from "@/lib/sport-page";
import { easternTime } from "@/lib/sport-slate";

/** One game's published selections and open FanDuel markets, each group with how it settles. */
export default function SportMarkets({
  page,
  gameId,
}: {
  page: SportPage;
  gameId: string;
}) {
  const now = Date.now();
  const selections = page.selections.filter(
    (s) => s.game_id === gameId && Date.parse(s.expires_at) > now,
  );
  const byId = new Map(page.markets.map((m) => [m.id, m]));
  const groups = gameMarkets(page, gameId, now);
  const quoted = groups
    .flatMap((g) => g.rows.map((m) => m.observed_at))
    .sort()
    .at(-1);
  return (
    <div className="sport-markets">
      <h3 className="sport-markets-title">Vegas Quant selections</h3>
      {selections.length ? (
        <ul className="sport-selections">
          {selections.map((s) => {
            const m = byId.get(s.market_id);
            return (
              <li key={s.id}>
                <span>
                  <b>{s.title}</b>
                  {m ? (
                    <small>
                      {m.player ? `${m.player} · ` : ""}
                      {marketLine(m)} · {m.settlement_note}
                    </small>
                  ) : null}
                </span>
                {m ? (
                  <span className="sport-price">
                    {americanPrice(m.odds)}
                    <small>{m.book}</small>
                  </span>
                ) : null}
                <details>
                  <summary>Why and the risk</summary>
                  <p>{s.why}</p>
                  <p>
                    <b>Risk:</b> {s.risk}
                  </p>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="sport-empty">
          No published selections for this game yet.
        </p>
      )}
      {groups.length ? (
        groups.map((g) => (
          <section key={g.market} className="sport-market-group">
            <h3 className="sport-markets-title">FanDuel · {g.label}</h3>
            <ul className="sport-market-rows">
              {g.rows.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.player ? <b>{m.player}</b> : null}
                    {marketLine(m)}
                  </span>
                  <b className="sport-odds">{americanPrice(m.odds)}</b>
                </li>
              ))}
            </ul>
            <p className="sport-settle">Settles: {g.settlement.join(" · ")}</p>
          </section>
        ))
      ) : (
        <p className="sport-empty">
          No open FanDuel markets for this game yet.
        </p>
      )}
      <p className="vq-prop-note">
        {quoted
          ? `FanDuel quotes as of ${easternTime(quoted, { hour: "numeric", minute: "2-digit" })} ET. `
          : ""}
        Prices move and are not guaranteed. Market lines are reference, not
        selections.
      </p>
    </div>
  );
}
