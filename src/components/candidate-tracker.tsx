"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import GamblyLink from "./gambly-link";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";

type Candidate = {
  experimental?: boolean;
  gambly_url?: string;
  odds?: number;
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
type Release = {
  id: string;
  title: string;
  candidates: Candidate[];
  created_at: string;
  expires_at: string;
};
export default function CandidateTracker({
  stageId,
  featured = false,
  archiveOnly = false,
  activeOnly = false,
}: {
  stageId?: string;
  featured?: boolean;
  archiveOnly?: boolean;
  activeOnly?: boolean;
}) {
  const [release, setRelease] = useState<Release | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    async function refresh() {
      let q = supabase
        .from("candidate_releases")
        .select("id,title,candidates,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(1);
      if (stageId) q = q.eq("stage_id", stageId);
      if (archiveOnly) q = q.lte("expires_at", new Date().toISOString());
      if (featured || activeOnly) q = q.gt("expires_at", new Date().toISOString());
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
  }, [stageId, featured, archiveOnly, activeOnly]);
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
  const list = featured && !experimental ? release.candidates.slice(0, 1) : release.candidates;
  const multiple = list.length > 1;
  return (
    <section
      className="candidate-tracker"
      aria-label={multiple ? "Potential picks" : featured ? "Potential next leg" : "Edge candidate tracker"}
    >
      <header>
        <span className="eyebrow">
          {experimental ? (multiple ? "EXPERIMENTAL PICKS" : "EXPERIMENTAL PICK") : featured ? "NEXT LEG WATCH" : "EDGE TRACKER"} ·{" "}
          {expired ? "ARCHIVED RESEARCH" : experimental ? "SUBJECT TO CHANGE · NOT OFFICIAL" : "WAIT · NOT OFFICIAL"}
        </span>
        <h2>{featured && !experimental ? "Potential next leg" : release.title}</h2>
        <p>
          {experimental
            ? "Experimental picks, subject to change. Play at your own risk. No outcome is guaranteed. These are individual research selections, not a four-leg parlay. Original publications stay on record."
            : featured
            ? "Our leading research candidate. Await the official decision before treating this as a challenge leg."
            : "Candidates under review. None has a verified 3-percentage-point edge in this release."}
        </p>
        <small>
          Published {time(release.created_at)} ·{" "}
          {expired
            ? "Past game window. These are historical quotes."
            : "Odds may change. Original observations are preserved."}
        </small>
      </header>
      {list.map((c, i) => (
        <article className="candidate-item" key={c.name}>
          <div className="eyebrow">
            {multiple ? `POTENTIAL PICK ${i + 1}` : i === 0 ? "LEADING CANDIDATE" : "WATCHLIST"} · {c.matchup}
          </div>
          <h3>{c.name}</h3>
          <p>{c.market}</p>
          <strong className="candidate-price">{c.quote}</strong>
          <p className="candidate-context">{c.quote_context}</p>
          {!expired && c.experimental && c.gambly_url && (
            <div className="notice">
              <GamblyLink url={c.gambly_url} selection={`${c.name} ${c.market} · ${c.matchup}`} />
              <p>Copies the exact pick and opens Gambly. Paste it into the search box. No prefilled share slip is available. Confirm the exact line and price before acting; opening this link does not record a wager.</p>
            </div>
          )}
          <details className="candidate-details">
            <summary>Full pick analysis & risks ↓</summary>
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
              <strong>{expired ? "Archived" : experimental ? "Experimental" : "WAIT"}</strong>
            </div>
          </div>
          <p className="notice">
            <b>Waiting for</b>
            <br />
            {c.next ||
              "Verified current price and a supported probability estimate."}
          </p>
          <small>
            Publication time is not the quote time. Confirm availability at your
            sportsbook; this research card does not authorize an entry.
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
      {!experimental && <p className="notice">
        <b>What “3% edge” means:</b> Our defensible estimated chance must exceed
        the price’s implied chance by at least 3 percentage points. It is not a
        3% guaranteed return. No qualifying edge has been established here.
      </p>}
      {featured && (
        <Link className="secondary" href="/feed">
          View all candidate research →
        </Link>
      )}
    </section>
  );
}
