"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";

type Candidate = {
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
}: {
  stageId?: string;
  featured?: boolean;
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
      if (featured) q = q.gt("expires_at", new Date().toISOString());
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
  }, [stageId, featured]);
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
  const list = featured ? release.candidates.slice(0, 1) : release.candidates;
  return (
    <section
      className="candidate-tracker"
      aria-label={featured ? "Potential next leg" : "Edge candidate tracker"}
    >
      <header>
        <span className="eyebrow">
          {featured ? "NEXT LEG WATCH" : "EDGE TRACKER"} ·{" "}
          {expired ? "ARCHIVED RESEARCH" : "WAIT · NOT OFFICIAL"}
        </span>
        <h2>{featured ? "Potential next leg" : release.title}</h2>
        <p>
          {featured
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
            {i === 0 ? "LEADING CANDIDATE" : "WATCHLIST"} · {c.matchup}
          </div>
          <h3>{c.name}</h3>
          <p>{c.market}</p>
          <strong className="candidate-price">{c.quote}</strong>
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
              <strong>{expired ? "Archived" : "WAIT"}</strong>
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
          {featured && (
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
        </article>
      ))}
      <p className="notice">
        <b>What “3% edge” means:</b> Our defensible estimated chance must exceed
        the price’s implied chance by at least 3 percentage points. It is not a
        3% guaranteed return. No qualifying edge has been established here.
      </p>
      {featured && (
        <Link className="secondary" href="/feed#candidate-tracker">
          View all candidate research →
        </Link>
      )}
    </section>
  );
}
