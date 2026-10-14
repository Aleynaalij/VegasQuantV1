"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import LegActions from "./leg-actions";
import DownloadCard from "./download-card";
import PriceFreshness from "./price-freshness";
import GamblyLink from "./gambly-link";
import TeamLogo from "./team-logo";
import { nflTeamCode } from "@/lib/nfl-teams";
import TeamHelmet from "./team-helmet";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
import { homeWeekStart, isCurrentHomeWeek } from "@/lib/home-week";

type Candidate = {
  book?: string;
  supersedes_release_id?: string;
  original_published_at?: string;
  original_quote?: string;
  original_leg_key?: string;
  original_legs?: { team: string; odds: number }[];
  analysis_kind?: string;
  pick_of_day?: boolean;
  experimental?: boolean;
  fun_play?: boolean;
  copy_text?: string;
  legs?: {
    team: string;
    matchup: string;
    odds: number | null;
    why: string;
    risk: string;
  }[];
  gambly_url?: string;
  odds?: number | null;
  odds_status?: string;
  quote_observed_at?: string;
  name: string;
  matchup: string;
  market: string;
  quote: string;
  quote_context: string;
  why: string;
  risk: string;
  next: string;
  sources: { label: string; url: string }[];
};
function copySelection(c: Candidate): string {
  if (c.fun_play && c.legs)
    return c.legs.map((leg) => `${leg.team} Moneyline`).join("\n");
  const stat = c.market
    .replace(/^(?:FULL GAME TOTAL|Full game|1st quarter)\s*[·:—-]\s*/i, "")
    .split(" · ")[0]
    .replace(/\s+total\s+/gi, " ")
    .trim();
  return `${c.name} ${stat}`;
}
export type CandidateRelease = {
  id: string;
  title: string;
  candidates: Candidate[];
  created_at: string;
  expires_at: string;
};
export default function CandidateTracker({
  stageId,
  releaseId,
  snapshot,
  pickOfDay = false,
  funPlayOnly = false,
  featured = false,
  archiveOnly = false,
  activeOnly = false,
}: {
  stageId?: string;
  releaseId?: string;
  snapshot?: CandidateRelease;
  pickOfDay?: boolean;
  funPlayOnly?: boolean;
  featured?: boolean;
  archiveOnly?: boolean;
  activeOnly?: boolean;
}) {
  const [fetchedRelease, setRelease] = useState<CandidateRelease | null>(null);
  const release = snapshot || fetchedRelease;
  const [failed, setFailed] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  useEffect(() => {
    if (snapshot) return;
    let live = true;
    async function refresh() {
      let q = supabase
        .from("candidate_releases")
        .select("id,title,candidates,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (featured) q = q.gte("created_at", homeWeekStart());
      if (releaseId) q = q.eq("id", releaseId);
      if (stageId) q = q.eq("stage_id", stageId);
      if (pickOfDay)
        q = q.contains("candidates", JSON.stringify([{ pick_of_day: true }]));
      if (funPlayOnly)
        q = q.contains("candidates", JSON.stringify([{ fun_play: true }]));
      if (archiveOnly) q = q.lte("expires_at", new Date().toISOString());
      if ((featured || activeOnly) && !funPlayOnly)
        q = q.gt("expires_at", new Date().toISOString());
      const r = await q;
      if (live) {
        setFailed(!!r.error);
        if (!r.error) setRelease(r.data?.[0] || null);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [
    snapshot,
    releaseId,
    stageId,
    featured,
    archiveOnly,
    activeOnly,
    pickOfDay,
    funPlayOnly,
  ]);
  if (release && featured && !isCurrentHomeWeek(release.created_at))
    return null;
  if (!release)
    return failed ? (
      <p className="notice">
        Candidate research could not refresh. No official decision is implied.
      </p>
    ) : null;
  const expired = Date.now() >= new Date(release.expires_at).getTime();
  const implied =
    Number.isFinite(release.candidates[0]?.odds) &&
    Math.abs(release.candidates[0]?.odds || 0) >= 100
      ? (release.candidates[0].odds! < 0
          ? -release.candidates[0].odds! / (-release.candidates[0].odds! + 100)
          : 100 / (release.candidates[0].odds! + 100)) * 100
      : null;
  const experimental = release.candidates[0]?.experimental === true;
  const editorial = release.candidates.every(
    (c) => c.analysis_kind === "QUALITATIVE_EDITORIAL",
  );
  const funPlay = release.candidates[0]?.fun_play === true;
  const list = pickOfDay
    ? release.candidates.filter((c) => c.pick_of_day).slice(0, 1)
    : featured && !experimental
      ? release.candidates.slice(0, 1)
      : release.candidates;
  const multiple = list.length > 1;
  const allLegsText = list.map(copySelection).join("\n");
  async function copyAllLegs() {
    try {
      await navigator.clipboard.writeText(allLegsText);
      setAllCopied(true);
      setCopyFallback(false);
    } catch {
      setCopyFallback(true);
    }
  }
  return (
    <section
      className={`candidate-tracker ${funPlay ? "fun-ticket" : ""}`}
      aria-label={
        funPlay
          ? "Hail Mary ticket"
          : multiple
            ? "Potential picks"
            : featured
              ? "Potential next leg"
              : "Edge candidate tracker"
      }
    >
      <header>
        <span className="eyebrow">
          {pickOfDay
            ? "PICK OF THE DAY"
            : funPlay
              ? "HAIL MARY · SUNDAY FUN PLAY"
              : editorial
                ? "LEGS WE LIKE"
                : experimental
                  ? multiple
                    ? "EXPERIMENTAL PICKS"
                    : "EXPERIMENTAL PICK"
                  : featured
                    ? "NEXT LEG WATCH"
                    : "EDGE TRACKER"}{" "}
          ·{" "}
          {expired
            ? "ARCHIVED RESEARCH"
            : funPlay
              ? "ENTERTAINMENT"
              : editorial
                ? "ANALYST SELECTIONS"
                : experimental
                  ? "EXPERIMENTAL ANALYSIS"
                  : "RESEARCH"}
        </span>
        <h2>
          {featured && !experimental && !funPlay && !pickOfDay
            ? "Potential next leg"
            : release.title}
        </h2>
        <p>
          {funPlay
            ? "One Sunday moneyline ticket. One losing leg loses the parlay. Separate from Pick of the Day."
            : editorial
              ? "Individual selections with the matchup case and risk. Analyst stat targets and observed sportsbook prices are labeled separately."
              : experimental
                ? "Individual selections with the case and risk for each game. Experimental model estimates are identified below; original publications stay on record."
                : featured
                  ? "Our leading research candidate. Review its sources and risks; a research candidate is not a finalized pick."
                  : "Candidates under review. None has a verified 3-percentage-point edge in this release."}
        </p>
        <small>
          {release.candidates[0]?.supersedes_release_id
            ? "Prices updated"
            : "Published"}{" "}
          {time(release.created_at)} ·{" "}
          {expired
            ? "Past game window. These are historical quotes."
            : "Odds may change. Original observations are preserved."}
        </small>
      </header>
      {multiple && (
        <DownloadCard
          title={release.title}
          subtitle="Individual published selections"
          publishedAt={release.created_at}
          label={`Download all ${list.length} legs`}
          sections={list.flatMap((c) => [
            {
              heading: copySelection(c),
              text: c.matchup + "\n" + c.quote + "\n" + c.quote_context,
            },
            { heading: "Case", text: c.why },
            { heading: "Risk", text: c.risk },
            { heading: "Next check", text: c.next },
            {
              heading: "Sources",
              text: c.sources.map((s) => s.label + ": " + s.url).join("\n"),
            },
          ])}
        />
      )}
      {multiple && !expired && (
        <div className="ticket-action" style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <button className="secondary" onClick={() => void copyAllLegs()}>
              Copy all {list.length} legs
            </button>
            <GamblyLink
              url="https://gambly.com/"
              selection={allLegsText}
              label="Copy all & open Gambly ↗"
            />
          </div>
          {allCopied && <p role="status">Copied. Paste into Gambly.</p>}
          {copyFallback && (
            <textarea
              aria-label="All legs to copy"
              readOnly
              value={allLegsText}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <p>Full-game totals · Check available lines in your app.</p>
        </div>
      )}
      {list.map((c, i) => (
        <article className="candidate-item" key={c.name}>
          <div className="eyebrow">
            {c.fun_play
              ? "ONE PARLAY · ALL LEGS MUST WIN"
              : multiple
                ? `POTENTIAL PICK ${i + 1}`
                : i === 0
                  ? "LEADING CANDIDATE"
                  : "WATCHLIST"}{" "}
            · {c.matchup}
          </div>
          {!c.fun_play && (
            <div className="candidate-player">
              {nflTeamCode(c.name) ? (
                <TeamLogo team={c.name} size={48} />
              ) : (
                <TeamHelmet name={c.name} />
              )}
              <h3>{c.name}</h3>
            </div>
          )}
          {!c.fun_play && <p>{c.market}</p>}
          {c.fun_play ? (
            <div className="ticket-price-note">
              {c.book
                ? `${c.book} Research snapshots · combined odds & boost unverified`
                : "Combined odds & boost unverified · individual prices are historical observations"}
              {c.book && <p>{c.quote_context}</p>}
            </div>
          ) : (
            <>
              <strong className="candidate-price">{c.quote}</strong>
              {c.odds_status !== "USER_SCREENSHOT_QUOTE_TIME_UNKNOWN" && (
                <p className="candidate-context">{c.quote_context}</p>
              )}
              {c.odds_status !== "UNPRICED_ANALYST_TARGET" && (
                <PriceFreshness at={c.quote_observed_at} />
              )}
            </>
          )}
          {c.fun_play && c.legs && (
            <>
              <div className="ticket-legs">
                {c.legs.slice(0, featured ? 2 : 4).map((leg) => (
                  <div className="ticket-leg" key={leg.team}>
                    <TeamLogo team={leg.team} />
                    <div>
                      <strong>{leg.team.split(" ").at(-1)}</strong>
                      <small>Moneyline{c.book ? ` · ${c.book}` : ""}</small>
                    </div>
                    <b>
                      {leg.odds == null
                        ? "Unavailable"
                        : `${leg.odds > 0 ? "+" : ""}${leg.odds}`}
                    </b>
                  </div>
                ))}
              </div>
              <details className="ticket-more">
                <summary>View all {c.legs.length} legs & game times</summary>
                <div className="ticket-legs ticket-legs-full">
                  {c.legs.map((leg) => (
                    <div className="ticket-leg" key={leg.team}>
                      <TeamLogo team={leg.team} />
                      <div>
                        <strong>{leg.team}</strong>
                        <small>{leg.matchup}</small>
                      </div>
                      <b>
                        {leg.odds == null
                          ? "Unavailable"
                          : `${leg.odds > 0 ? "+" : ""}${leg.odds}`}
                      </b>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
          {!expired && (c.experimental || editorial) && c.gambly_url && (
            <div className="ticket-action">
              <GamblyLink url={c.gambly_url} selection={copySelection(c)} />
              <p>
                18+ · Copy, open Gambly, then paste. Verify every line and
                price.
              </p>
            </div>
          )}
          <DownloadCard
            title={c.fun_play ? release.title : copySelection(c)}
            subtitle={c.matchup}
            publishedAt={release.created_at}
            sections={[
              { heading: "Selection", text: copySelection(c) },
              { heading: "Matchup", text: c.matchup },
              {
                heading: "Published price / context",
                text: c.quote + "\n" + c.quote_context,
              },
              { heading: "Why we like it", text: c.why },
              { heading: "Why it could lose", text: c.risk },
              { heading: "Next check", text: c.next },
              {
                heading: "Sources",
                text: c.sources.map((s) => s.label + ": " + s.url).join("\n"),
              },
            ]}
          />
          <LegActions
            legKey={
              c.original_leg_key ||
              `candidate:${release.id}:${release.candidates.indexOf(c) + 1}`
            }
            expired={expired}
          />
          <details className="candidate-details">
            <summary>Full pick analysis & risks ↓</summary>
            {c.supersedes_release_id && (
              <details>
                <summary>Original published prices</summary>
                <p>
                  Original publication
                  {c.original_published_at
                    ? ` · ${time(c.original_published_at)}`
                    : ""}
                  . Selections are unchanged.
                </p>
                <p>{c.original_quote}</p>
                {c.original_legs?.map((leg) => (
                  <p key={leg.team}>
                    {leg.team}: {leg.odds > 0 ? "+" : ""}
                    {leg.odds}
                  </p>
                ))}
              </details>
            )}
            <p className="candidate-context">{c.quote_context}</p>
            <div className="candidate-facts">
              <div>
                <small>Quote observation</small>
                <strong>
                  {c.quote_observed_at &&
                  Number.isFinite(Date.parse(c.quote_observed_at))
                    ? time(c.quote_observed_at)
                    : "Time not verified"}
                </strong>
              </div>
              <div>
                <small>Entry limit</small>
                <strong>Not established</strong>
              </div>
              <div>
                <small>Decision</small>
                <strong>
                  {expired
                    ? "Archived"
                    : c.analysis_kind === "QUALITATIVE_EDITORIAL"
                      ? "Analyst selection"
                      : experimental
                        ? "Experimental"
                        : "WAIT"}
                </strong>
              </div>
            </div>
            <p className="notice">
              <b>Waiting for</b>
              <br />
              {c.next ||
                "Verified current price and a supported probability estimate."}
            </p>
            <small>
              Publication time is not the quote time. Confirm availability at
              your sportsbook; this research card does not authorize an entry.
            </small>
            {featured && !experimental && (
              <div className="candidate-facts">
                <div>
                  <small>Break-even at quoted odds</small>
                  <strong>
                    {implied === null ? "Unknown" : `${implied.toFixed(2)}%`}
                  </strong>
                </div>
                <div>
                  <small>Model probability needed for +3 pp</small>
                  <strong>
                    {implied === null
                      ? "Unknown"
                      : `${(implied + 3).toFixed(2)}%`}
                  </strong>
                </div>
                <div>
                  <small>Verified model / edge</small>
                  <strong>Unknown</strong>
                </div>
              </div>
            )}
            {c.fun_play && c.legs && (
              <div>
                <h4>Every leg: case & failure risk</h4>
                {c.legs.map((leg) => (
                  <div key={leg.team} style={{ marginBottom: 16 }}>
                    <strong>{leg.team}</strong>
                    <p>{leg.why}</p>
                    <p>
                      <b>Risk:</b> {leg.risk}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p>
              <b>Why we’re watching</b>
              <br />
              {c.why}
            </p>
            <details className="candidate-details" open={featured}>
              <summary>Read the case, risks & next checks ↓</summary>
              <p>
                <b>What could beat this read</b>
                <br />
                {c.risk}
              </p>
              {featured && (
                <p>
                  Projection, confidence, risk score, EV, fair price, playable
                  limit and predicted close: not established. No stake assigned.
                  Exact-prop ticket and money splits unavailable.
                </p>
              )}
              <div className="candidate-sources">
                {c.sources
                  .filter((s) => s.url.startsWith("https://"))
                  .map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.label} ↗
                    </a>
                  ))}
              </div>
            </details>
          </details>
        </article>
      ))}
      {!experimental && (
        <p className="notice">
          <b>What “3% edge” means:</b> Our defensible estimated chance must
          exceed the price’s implied chance by at least 3 percentage points. It
          is not a 3% guaranteed return. No qualifying edge has been established
          here.
        </p>
      )}
      {featured && (
        <Link className="secondary" href="/feed">
          View all candidate research →
        </Link>
      )}
    </section>
  );
}
