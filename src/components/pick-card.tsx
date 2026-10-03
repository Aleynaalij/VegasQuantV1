import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, CircleCheck } from "lucide-react";
import {
  clv,
  lineText,
  money,
  odd,
  signedMoney,
  winProfit,
  type Desk,
  type Pick,
} from "@/lib/domain";
import { Badge, SourceLink } from "./ui";
import { isMarketInfoUrl } from "@/lib/market-info";
import SourceStatus from "./source-status";
import CopyPick from "./copy-pick";
import BrandMark from "./brand-mark";
export default function PickCard({
  p,
  d,
  share = false,
  allowShare = true,
  entryAction,
  compact = false,
  personalPath = false,
}: {
  p: Pick;
  d: Desk;
  share?: boolean;
  allowShare?: boolean;
  entryAction?: ReactNode;
  compact?: boolean;
  personalPath?: boolean;
}) {
  const SlipBody = "details";
  const st = d.stages.find((s) => s.id === p.stage_id),
    ch = d.challenges.find((c) => c.id === st?.challenge_id),
    g = d.games.find((g) => g.id === p.game_id),
    e = d.entries.find((e) => e.pick_id === p.id),
    close = d.closings.find((c) => c.pick_id === p.id),
    r = d.results.find((r) => r.pick_id === p.id),
    review = d.reviews.find((r) => r.pick_id === p.id),
    c = clv(p, e, close);
  const reserve = d.transactions.find(
    (t) => t.pick_id === p.id && t.kind === "RESERVE",
  );
  return (
    <article
      className={`official-card ${r?.result === "WIN" ? "official-card-won" : ""} ${share ? "share-card" : ""} ${compact ? "community-compact-slip" : ""}`}
    >
      {r?.result === "WIN" && (
        <div className="pick-win-banner" role="status">
          <CircleCheck
            className="pick-win-check"
            size={80}
            aria-hidden="true"
          />
          <div>
            <span className="eyebrow">
              LEG {st?.stage_number ?? ""} · SETTLED
            </span>
            <h2>WE WON</h2>
            <p>{signedMoney(r.profit_cents)} official profit</p>
            {st && st.stage_number < 5 && (
              <p>On to Stage {st.stage_number + 1}</p>
            )}
          </div>
        </div>
      )}
      <div className="panel-head">
        <span className="eyebrow">
          <ShieldCheck size={15} />
          OFFICIAL {st ? `LEG #${st.stage_number}` : "PLAY"}
        </span>
        <Badge tone={r?.result === "LOSS" ? "red" : "green"}>
          {r?.result || "OFFICIAL PLAY"}
        </Badge>
      </div>
      <p className="muted">
        {g?.away_team} @ {g?.home_team}
      </p>
      <h2>{p.selection}</h2>
      <div className="official-price">
        {odd(p.odds)} <span>{p.book}</span>
      </div>
      {!r && entryAction}
      {compact && (
        <p className="slip-quick-metrics">
          Analyst edge: +{p.edge} pp · Confidence: {p.confidence}/10
        </p>
      )}
      {!compact && (
        <p className="slip-why">
          <strong>The read</strong> {p.why_like.split(/\n\s*\n/)[0]}{" "}
          <Link href={`/games/${g?.slug}`}>See the research →</Link>
        </p>
      )}
      <p className="pick-publication">
        Published{" "}
        <time dateTime={p.created_at}>
          {new Date(p.created_at).toLocaleString("en-US", {
            timeZone: "America/New_York",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
          })}
        </time>{" "}
        · Vegas Quant Ultra
      </p>
      <p className="pick-odds-notice">
        Odds and available lines may change. This card preserves the original
        published selection, line, odds, and stake; later sportsbook prices do
        not change that record.
      </p>
      {!share && !compact && (
        <SourceStatus
          source={p.book ? `${p.book} · owner / analyst handoff` : undefined}
          at={p.created_at}
          kind="Published price"
          historical
        />
      )}
      {!share && (
        <CopyPick
          selection={p.selection}
          odds={p.odds}
          stakeCents={p.stake_cents}
        />
      )}
      <SlipBody className="slip-details" {...(!compact ? { open: true } : {})}>
        <summary className={compact ? "slip-expand-cta" : ""}>
          {compact
            ? "OPEN FULL PICK & ANALYSIS ↓"
            : "Full slip · stake, analysis & results"}
        </summary>
        {personalPath ? (
          <p className="personal-caption">
            Original published stake: {money(p.stake_cents)}. Your actual stake
            and bankroll are tracked in your path below.
          </p>
        ) : (
          <>
            <div className="pick-finances">
              <div>
                <span>Stake</span>
                <strong>{money(p.stake_cents)}</strong>
              </div>
              <div>
                <span>To win</span>
                <strong className="positive">
                  {money(winProfit(p.stake_cents, p.odds))}
                </strong>
              </div>
              <div>
                <span>{r ? "Challenge balance" : "Balance if win"}</span>
                <strong>
                  {r?.bankroll_cents !== null && r?.bankroll_cents !== undefined
                    ? money(r.bankroll_cents)
                    : ch
                      ? money(
                          (reserve?.balance_cents ?? ch.balance_cents) +
                            winProfit(p.stake_cents, p.odds),
                        )
                      : "Standalone"}
                </strong>
              </div>
            </div>
          </>
        )}
        <div className="pick-numbers">
          {[
            ["Model probability", `${p.model_probability}%`],
            ["Market probability", `${p.market_probability}%`],
            ["Analyst edge", `+${p.edge} pp`],
            ["Confidence", `${p.confidence}/10`],
            ["Risk", `${p.risk}/10`],
            ["Fear index", `${p.fear_index}/10`],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className="number-track">
          <div>
            <small>RECOMMENDED</small>
            <strong>
              {lineText(p.recommended_line)} <span>{odd(p.odds)}</span>
            </strong>
          </div>
          <div>
            <small>ACTUALLY BET</small>
            <strong>
              {e ? `${lineText(e.line)} ${odd(e.odds)}` : "Not confirmed"}
            </strong>
          </div>
          <div>
            <small>CLOSING</small>
            <strong>
              {close ? `${lineText(close.line)} ${odd(close.odds)}` : "Pending"}
            </strong>
          </div>
        </div>
        {c.key && <p className="key-alert">{c.key}</p>}
        {e &&
          p.market === "Side" &&
          e.line !== null &&
          p.recommended_line !== null &&
          e.line > p.recommended_line && (
            <p className="key-alert">
              Actual entry improved on the recommended number by{" "}
              {(e.line - p.recommended_line).toFixed(1)} points.
            </p>
          )}
        <div className="callout-row">
          <Badge tone="gold">Grade {p.bet_grade}</Badge>
          {!r && <Badge tone="green">{p.timing}</Badge>}
          <span>Predicted close: {p.predicted_close}</span>
        </div>
        <div className="pick-reason">
          <h3>WHY WE LIKE IT</h3>
          <p>{p.why_like}</p>
          <h3>WHY IT COULD LOSE</h3>
          <p>{p.why_lose}</p>
        </div>
        <div className="price-rules">
          <p>
            <span>Best available</span>
            <strong>{p.best_number}</strong>
          </p>
          <p>
            <span>Playable</span>
            <strong>{p.playable_number}</strong>
          </p>
          <p>
            <span>Pass number</span>
            <strong>{p.pass_number}</strong>
          </p>
        </div>
        {r && (
          <div className="result-block">
            <h3>
              {r.away_score !== null && r.home_score !== null
                ? `FINAL · ${r.away_score} – ${r.home_score}`
                : "WAGER SETTLED · Final game score pending"}
            </h3>
            <p className={r.profit_cents < 0 ? "negative" : "positive"}>
              {r.result} · {signedMoney(r.profit_cents)} net
            </p>
            <SourceLink href={r.source}>Result source</SourceLink>
            <p>
              Price CLV:{" "}
              {c.price === null
                ? "Not comparable / pending"
                : `${c.price.toFixed(2)}%`}{" "}
              · Line CLV:{" "}
              {c.points === null
                ? "—"
                : `${c.points > 0 ? "+" : ""}${c.points} pts`}
            </p>
            {close && (
              <SourceLink href={close.source}>Closing source</SourceLink>
            )}
          </div>
        )}
        {review && (
          <div className="review-block">
            <Badge tone="gold">PROCESS {review.grade}</Badge>
            <h3>{review.classification}</h3>
            <p>{review.lessons}</p>
          </div>
        )}
      </SlipBody>
      {!share && isMarketInfoUrl(p.market_info_url) && (
        <p>
          <a href={p.market_info_url} target="_blank" rel="noopener noreferrer">
            View Market Info ↗
          </a>
          <small>
            {" "}
            · Informational comparison only. Current prices may differ.
          </small>
        </p>
      )}
      <div className="pick-bottom">
        <small className="slip-brand-signature">
          <BrandMark /> Original publication preserved · Vegas Quant Ultra
        </small>
        {!share && allowShare && (
          <Link href={`/picks/${p.id}/share`}>
            Share Pick
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </article>
  );
}
