"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  matchupStatuses,
  updateTypes,
  matchupUpdateSchema,
  type MatchupUpdate,
} from "@/lib/matchups";
import type { Game } from "@/lib/domain";
import { Shell, Panel } from "./ui";
export default function MatchupPublisher() {
  const [allowed, setAllowed] = useState(false),
    [games, setGames] = useState<Game[]>([]),
    [game, setGame] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<MatchupUpdate | null>(null),
    [request, setRequest] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      const a = await supabase.rpc("is_admin");
      if (!live) return;
      setAllowed(a.data === true);
      if (a.data) {
        const g = await supabase.from("games").select("*").order("kickoff");
        if (live) setGames(g.data || []);
      }
    }
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => {
      setAllowed(false);
      setTimeout(load, 0);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  function prepare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice("");
    try {
      const f = new FormData(e.currentTarget);
      const structured = JSON.parse(String(f.get("structured") || "{}"));
      const draft = matchupUpdateSchema.parse({
        ...structured,
        status: f.get("status"),
        update_type: f.get("update_type"),
        summary: f.get("summary"),
        what_changed: f.get("what_changed"),
        response: f.get("response"),
        raw_handoff: f.get("raw_handoff"),
      });
      setPreview(draft);
      setRequest(crypto.randomUUID());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Invalid handoff");
    }
  }
  async function publish() {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await supabase.rpc("publish_matchup", {
        p_game: game,
        p_update: preview,
        p_request: request,
      });
      if (r.error) throw r.error;
      setNotice(
        `Published immutable version ${r.data.version}. Research pages will refresh.`,
      );
      setPreview(null);
    } catch (e) {
      setNotice((e as Error).message || "Publication failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell active="admin">
      <h1>Publish matchup intelligence</h1>
      <Link href="/admin">← Publishing desk</Link>
      {!allowed ? (
        <p>
          <Link href="/membership">Sign in and verify your admin account</Link>{" "}
          to publish.
        </p>
      ) : (
        <Panel title="Vegas Quant Ultra handoff">
          <form
            className="notebook mi-admin"
            onSubmit={prepare}
            onChange={() => setPreview(null)}
          >
            <label>
              Game
              <select
                required
                value={game}
                onChange={(e) => setGame(e.target.value)}
              >
                <option value="">Choose game</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.away_team} @ {g.home_team} ·{" "}
                    {new Date(g.kickoff).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status">
                {matchupStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Update type
              <select name="update_type">
                {updateTypes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Summary
              <input name="summary" required maxLength={1000} />
            </label>
            <label>
              What changed since last version
              <textarea name="what_changed" />
            </label>
            <label>
              Vegas Quant response
              <textarea name="response" />
            </label>
            <label>
              Original analyst handoff
              <textarea name="raw_handoff" required />
            </label>
            <details>
              <summary>Structured market, model and target data</summary>
              <p>
                Paste a JSON object using market, model, injuries, teams,
                weather, vegas, bias, targets, next_review or sections. Omitted
                sections carry forward unchanged. Empty arrays clear a list.
                Targets are a complete replacement list. Only link OFFICIAL
                targets to an already published pick.
              </p>
              <textarea
                name="structured"
                defaultValue="{}"
                spellCheck={false}
              />
            </details>
            <button className="primary" disabled={busy || !game}>
              Preview update
            </button>
          </form>
          {preview && (
            <div className="notebook">
              <h3>Review exact publication</h3>
              <pre className="mi-preview">
                {JSON.stringify(preview, null, 2)}
              </pre>
              <button className="primary" onClick={publish} disabled={busy}>
                Publish new immutable version
              </button>
            </div>
          )}
        </Panel>
      )}
      {notice && (
        <p role="status" className="preserve">
          {notice}
        </p>
      )}
    </Shell>
  );
}
