"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Panel } from "./ui";
export default function SportradarConnection() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
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
  async function preview() {
    setBusy(true); setError(""); setResult(null);
    try {
      const session = await supabase.auth.getSession();
      const r = await fetch("/api/admin/sportradar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}` }, body: JSON.stringify({ game_id: game.trim(), feed }) });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Provider request failed");
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Provider request failed"); }
    finally { setBusy(false); }
  }
  return <Panel title="Sportradar · NFL live-data connection">
    <p>{status?.status === "ready_to_verify" ? "Configured · awaiting live verification" : "Not connected · credentials and access need verification"}</p>
    {Array.isArray(status?.blockers) && <ul>{status.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul>}
    <p>Manual administrator preview only. No automated polling, public display, pick publication or grading is enabled.</p>
    <label>Sportradar game UUID (not the Vegas Quant game ID)<input value={game} onChange={e => setGame(e.target.value)} placeholder="Use the provider’s NFL schedule" /></label>
    <label>Feed<select value={feed} onChange={e => setFeed(e.target.value)}><option value="statistics">Team and player statistics</option><option value="pbp">Play-by-play</option></select></label>
    <button className="secondary" disabled={busy || !game || status?.status !== "ready_to_verify"} onClick={preview}>{busy ? "Checking provider…" : "Fetch one private preview"}</button>
    {error && <p role="alert">{error}</p>}
    {result && <details><summary>Private response · timestamps and source hash</summary><pre className="mi-preview">{JSON.stringify(result, null, 2)}</pre></details>}
  </Panel>;
}
