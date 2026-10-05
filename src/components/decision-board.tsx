"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { time } from "@/lib/domain";
import { type BoardGame } from "@/lib/decision-board";
type Score = { id: string; kickoff: string; away: string; home: string; awayScore: string; homeScore: string; state: string; detail: string };
export default function DecisionBoard({ games }: { games: BoardGame[] }) {
  const [scores, setScores] = useState<Score[]>([]), [at, setAt] = useState(""), [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const r = await fetch("/api/scores");
        if (!r.ok) throw Error();
        const d = await r.json();
        if (live) { setScores(d.games); setAt(d.retrievedAt); setError(false); }
      } catch { if (live) setError(true); }
    }
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    window.addEventListener("focus", refresh);
    return () => { live = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const match = (s: Score) => games.find(g => g.slug.startsWith(`${s.away?.toLowerCase()}-${s.home?.toLowerCase()}-`) && Math.abs(Date.parse(g.kickoff)-Date.parse(s.kickoff))<86400000);
  const featured = scores.filter(s => s.state === "in").concat(scores.filter(s => s.state === "pre"), scores.filter(s => s.state === "post"));
  return <details className="sports-ticker">
    <summary><span className="ticker-label">NFL SCORES</span><span className="ticker-scroll">{featured.length ? featured.map(s => <span key={s.id}>{s.away} {s.state === "pre" ? "@" : s.awayScore} {s.home} {s.state === "pre" ? "" : s.homeScore} · {s.detail}</span>) : <span>{error ? "Scores unavailable" : "Loading scores…"}</span>}</span><b>Expand ▾</b></summary>
    <div className="ticker-games">{featured.map(s => {const g=match(s); return <div key={s.id}><strong>{s.away} {s.state === "pre" ? "@" : s.awayScore} {s.home} {s.state === "pre" ? "" : s.homeScore}</strong><small>{s.detail}</small>{g ? <Link href={`/matchups/${g.slug}`}>Open game analysis →</Link> : <Link href={`/matchups?q=${encodeURIComponent(s.away+" "+s.home)}`}>Find game analysis →</Link>}</div>;})}{error && <p role="status">Score refresh unavailable. Previously retrieved scores may be stale.</p>}<small>ESPN · refreshes every 30 seconds · {at ? `Retrieved ${time(at)}` : "Waiting for feed"}. Provider updates may be delayed.</small><Link href="/matchups">All matchups & analysis →</Link></div>
    <style jsx>{`
      .sports-ticker{border:1px solid #304441;border-radius:14px;background:#101c23;margin:0 0 14px;overflow:hidden}
      summary{display:flex;align-items:center;gap:12px;padding:13px;cursor:pointer;list-style:none;min-width:0}
      .ticker-label{font-size:10px;letter-spacing:1px;color:#8ce3bd;flex-shrink:0}.ticker-scroll{display:flex;gap:28px;overflow-x:auto;white-space:nowrap;flex:1;font-size:13px;scrollbar-width:none}summary b{font-size:11px;flex-shrink:0;color:#8ce3bd}
      .ticker-games{padding:12px;display:grid;gap:12px}.ticker-games>div{display:grid;gap:5px;padding:10px;border-bottom:1px solid #304441}.ticker-games small{color:#a9baba}.ticker-games a{font-size:13px}
    `}</style>
  </details>;
}
