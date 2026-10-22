"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
export default function SportradarConnection() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [games, setGames] = useState<Array<{id: string; scheduled: string; status: string; home: {alias: string}; away: {alias: string}}>>([]);
  const [verified, setVerified] = useState(false);
  const [game, setGame] = useState("");
  const [feed, setFeed] = useState("statistics");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const session = await supabase.auth.getSession();
        const r = await fetch("/api/admin/sportradar", { headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` }, cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw Error("Sportradar configuration could not load.");
        if (live) setStatus(data);
      } catch { if (live) setError("Sportradar configuration could not load."); }
    })();
    return () => { live = false; };
  }, []);
  async function preview(schedule = false) {
    setBusy(true); setError(""); setResult(null);
    try {
      const session = await supabase.auth.getSession();
      const r = await fetch("/api/admin/sportradar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` }, body: JSON.stringify(schedule ? { action: "schedule" } : { game_id: game.trim(), feed }) });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Provider request failed");
      setResult(data);
      if (schedule) {
        setGames(data.games);
        const next = data.games.find((g: {status: string}) => g.status === "inprogress") || data.games.find((g: {scheduled: string}) => Date.parse(g.scheduled) >= Date.now()) || data.games.at(-1);
        setGame(next?.id || "");
      } else setVerified(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Provider request failed"); }
    finally { setBusy(false); }
  }
  return <Panel title="Sportradar · NFL live-data connection">
    <p>{verified ? "Game feed received · live freshness still requires validation" : status?.status === "ready_to_verify" ? "Configured · awaiting live verification" : "Not connected · credentials and access need verification"}</p>
    {Array.isArray(status?.blockers) && <ul>{status.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul>}
    <p>Manual administrator preview only. No automated polling, public display, pick publication or grading is enabled.</p>
    <button className="secondary" disabled={busy || status?.status !== "ready_to_verify"} onClick={() => preview(true)}>{busy ? "Checking provider…" : "Load NFL games · check API access"}</button>
    {games.length > 0 && <label>Choose a game<select value={game} onChange={e => { setGame(e.target.value); setVerified(false); setResult(null); }}>{games.map(g => <option key={g.id} value={g.id}>{g.away.alias} @ {g.home.alias} · {new Date(g.scheduled).toLocaleString()} · {g.status}</option>)}</select></label>}
    <p>Loading games makes one private schedule request. Select a game, then fetch statistics or play-by-play. Schedule receipt alone does not verify a live game feed.</p>
    <label>Sportradar game UUID (not the Vegas Quant game ID)<input value={game} onChange={e => setGame(e.target.value)} placeholder="Use the provider’s NFL schedule" /></label>
    <label>Feed<select value={feed} onChange={e => setFeed(e.target.value)}><option value="statistics">Team and player statistics</option><option value="pbp">Play-by-play</option></select></label>
    <button className="secondary" disabled={busy || !game || status?.status !== "ready_to_verify"} onClick={() => preview()}>{busy ? "Checking provider…" : "Fetch one private preview"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <details><summary>Private response · timestamps and source hash</summary><pre className="mi-preview">{JSON.stringify(result, null, 2)}</pre></details>}
  </Panel>;
}
