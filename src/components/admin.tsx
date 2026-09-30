"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  LockKeyhole,
  LogOut,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  classifications,
  emptyDesk,
  money,
  sectionHints,
  sectionNames,
  time,
  type Desk,
} from "@/lib/domain";
import { Badge, Panel, Shell } from "./ui";
type InputDef = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: string;
};
const pickFields: InputDef[] = [
  { name: "selection", label: "Selection · exactly as supplied" },
  {
    name: "market",
    label: "Market",
    options: ["Side", "Moneyline", "Total", "Player Prop"],
  },
  {
    name: "recommended_line",
    label: "Recommended line · blank for moneyline",
    type: "number",
    required: false,
    step: "any",
  },
  {
    name: "direction",
    label: "Direction · totals / props",
    options: ["", "over", "under"],
    required: false,
  },
  {
    name: "odds",
    label: "Recommended American odds",
    type: "number",
    step: "any",
  },
  {
    name: "stake",
    label: "Stake ($)",
    type: "number",
    min: 0.01,
    step: "0.01",
  },
  {
    name: "model_probability",
    label: "Model probability (%)",
    type: "number",
    min: 0,
    max: 100,
    step: "any",
  },
  {
    name: "market_probability",
    label: "Analyst market probability (%)",
    type: "number",
    min: 0,
    max: 100,
    step: "any",
  },
  {
    name: "edge",
    label: "Analyst edge (%) · minimum 3",
    type: "number",
    min: 3,
    max: 100,
    step: "any",
  },
  {
    name: "confidence",
    label: "Confidence / 10",
    type: "number",
    min: 0,
    max: 10,
    step: "any",
  },
  {
    name: "risk",
    label: "Risk / 10",
    type: "number",
    min: 0,
    max: 10,
    step: "any",
  },
  {
    name: "fear_index",
    label: "Sportsbook Fear Index / 10",
    type: "number",
    min: 0,
    max: 10,
    step: "any",
  },
  { name: "book", label: "Sportsbook" },
  { name: "predicted_close", label: "Predicted closing line" },
  { name: "best_number", label: "Best available number" },
  { name: "bet_grade", label: "Bet grade" },
  { name: "timing", label: "Bet timing · exactly as supplied" },
  { name: "playable_number", label: "Playable number" },
  { name: "pass_number", label: "Pass number" },
  { name: "why_like", label: "Why we like it", type: "textarea" },
  { name: "why_lose", label: "Why it could lose", type: "textarea" },
  {
    name: "raw_handoff",
    label: "Original Vegas Quant Ultra handoff",
    type: "textarea",
  },
];
const gameFields: InputDef[] = [
  {
    name: "slug",
    label: "Public URL slug",
    placeholder: "team-team-2026-10-01",
  },
  { name: "away_team", label: "Away team" },
  { name: "home_team", label: "Home team" },
  {
    name: "kickoff",
    label: "Kickoff · your device time",
    type: "datetime-local",
  },
  { name: "venue", label: "Venue" },
  { name: "slot", label: "Broadcast / time slot" },
];
const marketFields: InputDef[] = [
  { name: "kind", label: "Snapshot type", options: ["current", "opening"] },
  {
    name: "observed_at",
    label: "Price observed · device time",
    type: "datetime-local",
  },
  { name: "spread", label: "Spread · include team and odds", required: false },
  {
    name: "moneyline",
    label: "Moneyline · both sides if provided",
    required: false,
  },
  { name: "total", label: "Total · include price", required: false },
  { name: "source", label: "Source URL or owner handoff reference" },
  {
    name: "notes",
    label: "Line movement / notes",
    type: "textarea",
    required: false,
  },
];
const actionLabels: Record<string, string> = {
  analysis: "Publish analysis",
  pick: "Official pick",
  market: "Market snapshot",
  entry: "Actual bet entry",
  close: "Closing line",
  result: "Grade result",
  review: "Process & lessons",
  game: "Game details",
  pause: "Pause / pass",
  resume: "Resume challenge",
  new_challenge: "New challenge",
};
const projectionFields = [
  "true_spread",
  "true_moneyline",
  "true_total",
  "line_movement",
  "fear_index",
  "public_side",
  "sharp_side",
  "dangerous_side",
  "trap_risk",
  "predicted_close",
];
function Inputs({
  fields,
  defaults = {},
}: {
  fields: InputDef[];
  defaults?: Record<string, unknown>;
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <label
          className={`field ${f.type === "textarea" ? "full" : ""}`}
          key={f.name}
        >
          <span>
            {f.label}
            {f.required === false ? "" : " *"}
          </span>
          {f.options ? (
            <select
              name={f.name}
              required={f.required !== false}
              defaultValue={String(defaults[f.name] ?? "")}
            >
              <option value="" disabled={f.required !== false}>
                Select…
              </option>
              {f.options.filter(Boolean).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.name}
              rows={4}
              required={f.required !== false}
              defaultValue={String(defaults[f.name] ?? "")}
              placeholder={f.placeholder}
            />
          ) : (
            <input
              name={f.name}
              type={f.type || "text"}
              required={f.required !== false}
              defaultValue={String(defaults[f.name] ?? "")}
              placeholder={f.placeholder}
              min={f.min}
              max={f.max}
              step={f.step}
            />
          )}
        </label>
      ))}
    </div>
  );
}
export default function Admin() {
  const [session, setSession] = useState<Session | null>(null),
    [authorized, setAuthorized] = useState(false),
    [checking, setChecking] = useState(true),
    [d, setD] = useState<Desk>(emptyDesk),
    [action, setAction] = useState("analysis"),
    [gameId, setGameId] = useState(""),
    [pickId, setPickId] = useState(""),
    [challengeId, setChallengeId] = useState(""),
    [stageId, setStageId] = useState(""),
    [signup, setSignup] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Record<string, unknown> | null>(null),
    [requestId, setRequestId] = useState(""),
    [formKey, setFormKey] = useState(0),
    [editingGame, setEditingGame] = useState(false),
    [importText, setImportText] = useState(""),
    [importDefaults, setImportDefaults] = useState<Record<string, unknown>>({});
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("desk_data");
    if (error) throw error;
    if (mounted.current) {
      setD(data);
      setGameId((v) => v || data.games[0]?.id || "");
      setPickId((v) => v || data.picks[0]?.id || "");
      setChallengeId((v) => v || data.challenges[0]?.id || "");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession(s),
    );
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    return () => {
      mounted.current = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setAuthorized(false);
    if (!session) return;
    setChecking(true);
    Promise.all([supabase.rpc("is_admin"), refresh()])
      .then(([admin]) => {
        if (live) {
          setAuthorized(admin.data === true);
          if (admin.error) setNotice(admin.error.message);
        }
      })
      .catch((e) => {
        if (live) setNotice(e.message);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [session?.user.id, refresh]);
  const ch = d.challenges.find((c) => c.id === challengeId),
    stages = d.stages.filter((s) => s.challenge_id === challengeId),
    current = stages.find((s) => s.stage_number === ch?.current_stage),
    game = d.games.find((g) => g.id === gameId),
    pick = d.picks.find((p) => p.id === pickId),
    analyses = d.analyses.filter((a) => a.game_id === gameId);
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    const credentials = {
      email: String(f.get("email")),
      password: String(f.get("password")),
    };
    try {
      const { error, data } = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: location.origin + "/admin" },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (signup)
        setNotice(
          data.session
            ? "Account created. Admin access must still be granted by the owner."
            : "Check your email to confirm the account, then sign in. Creating an account does not grant publishing access.",
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }
  function switchAction(next: string) {
    setAction(next);
    setPreview(null);
    setNotice("");
    setImportDefaults({});
    setFormKey((v) => v + 1);
  }
  function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        data: Record<string, unknown> = {};
      f.forEach((v, k) => (data[k] = String(v)));
      const num = (key: string) => {
        data[key] =
          data[key] === "" || data[key] === undefined
            ? null
            : Number(data[key]);
      };
      const date = (key: string) => {
        if (data[key]) data[key] = new Date(String(data[key])).toISOString();
      };
      if (action === "analysis") {
        data.game_id = gameId;
        data.sections = Object.fromEntries(
          sectionNames
            .map((s) => [s, data["section:" + s]])
            .filter(([, v]) => v !== ""),
        );
        data.projections = Object.fromEntries(
          projectionFields
            .map((s) => [s, data["projection:" + s]])
            .filter(([, v]) => v !== ""),
        );
        Object.keys(data)
          .filter(
            (k) => k.startsWith("section:") || k.startsWith("projection:"),
          )
          .forEach((k) => delete data[k]);
      }
      if (action === "market") {
        data.game_id = gameId;
        date("observed_at");
      }
      if (action === "pick") {
        data.game_id = gameId;
        data.stage_id = data.stage_id || null;
        [
          "recommended_line",
          "odds",
          "model_probability",
          "market_probability",
          "edge",
          "confidence",
          "risk",
          "fear_index",
        ].forEach(num);
        data.stake_cents = Math.round(Number(data.stake) * 100);
        delete data.stake;
        data.direction = data.direction || null;
        if (Number(data.edge) < 3)
          throw new Error(
            "Below 3%: do not publish a wager. Use Pause / pass instead.",
          );
        if (!data.analysis_id)
          throw new Error("Publish the analyst’s analysis version first.");
      }
      if (["entry", "close", "result", "review"].includes(action)) {
        if (!pickId) throw new Error("Select an official pick.");
        data.pick_id = pickId;
      }
      if (["entry", "close"].includes(action)) {
        num("line");
        num("odds");
        date(action === "entry" ? "bet_at" : "observed_at");
      }
      if (action === "result") {
        num("away_score");
        num("home_score");
      }
      if (action === "game") {
        date("kickoff");
        if (editingGame) data.id = gameId;
        data.stage_id = data.stage_id || null;
      }
      if (["pause", "resume"].includes(action)) {
        data.challenge_id = challengeId;
        if (action === "resume") num("next_stage");
      }
      setRequestId(crypto.randomUUID());
      setPreview(data);
      setNotice("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Please review the fields.");
    }
  }
  async function publish() {
    if (!preview || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.rpc("publish", {
        p_action: action,
        p_payload: preview,
        p_request_id: requestId,
      });
      if (error) throw error;
      await refresh();
      setPreview(null);
      setFormKey((v) => v + 1);
      setNotice(
        "Published. The public site has been updated and the audit event saved.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message ||
              "Publishing failed. Nothing was committed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function importPick() {
    try {
      const payload = JSON.parse(importText);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Paste a JSON object.");
      setImportDefaults(payload);
      setFormKey((v) => v + 1);
      setNotice(
        "Imported supplied fields. Review every value below; missing required fields remain blank.",
      );
    } catch {
      setNotice(
        "This import accepts the structured JSON handoff format. You can paste prose into the original handoff field and complete the labeled fields, or send it in Work chat for me to publish.",
      );
    }
  }
  let fields: InputDef[] = [];
  if (action === "pick") fields = pickFields;
  if (action === "game") fields = gameFields;
  if (action === "market") fields = marketFields;
  if (action === "entry" || action === "close")
    fields = [
      {
        name: "line",
        label:
          action === "entry"
            ? "Actual bet line · blank only for moneyline"
            : "Closing line · same selection",
        type: "number",
        step: "any",
        required: false,
      },
      { name: "odds", label: "American odds", type: "number", step: "any" },
      {
        name: action === "entry" ? "bet_at" : "observed_at",
        label:
          action === "entry"
            ? "Actual bet time · device time"
            : "Market close observed · device time",
        type: "datetime-local",
      },
      { name: "source", label: "Source / bet confirmation reference" },
    ];
  if (action === "result")
    fields = [
      {
        name: "result",
        label: "Sportsbook result",
        options: ["WIN", "LOSS", "PUSH", "VOID"],
      },
      { name: "away_score", label: "Final away score", type: "number", min: 0 },
      { name: "home_score", label: "Final home score", type: "number", min: 0 },
      { name: "source", label: "Result / sportsbook source" },
    ];
  if (action === "review")
    fields = [
      {
        name: "grade",
        label: "Process grade",
        options: ["A", "B", "C", "D", "F"],
      },
      {
        name: "classification",
        label: "Decision-quality classification",
        options: classifications,
      },
      {
        name: "lessons",
        label: "Lessons learned · appended as a new review",
        type: "textarea",
      },
    ];
  if (action === "pause" || action === "resume")
    fields = [
      ...(action === "resume"
        ? [
            {
              name: "next_stage",
              label: "Resume at stage · current or later",
              type: "number",
              min: ch?.current_stage || 1,
              max: 5,
            },
          ]
        : []),
      {
        name: "reason",
        label:
          action === "pause"
            ? "Pass / pause reason"
            : "Why the challenge can resume",
        type: "textarea",
      },
    ];
  const defaults =
    action === "game" && editingGame && game
      ? {
          ...game,
          kickoff: new Date(
            new Date(game.kickoff).getTime() -
              new Date(game.kickoff).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16),
        }
      : action === "pick"
        ? importDefaults
        : {};
  return (
    <Shell active="admin">
      <div className="heading">
        <div>
          <span className="eyebrow">PRIVATE PUBLISHING DESK</span>
          <h1>Publish with intention.</h1>
          <p>Vegas Quant Ultra supplies the read. This desk preserves it.</p>
        </div>
        {session && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={15} />
            Sign out
          </button>
        )}
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {checking ? (
        <div className="empty">Checking secure access…</div>
      ) : !session ? (
        <Panel
          title={signup ? "Create your account" : "Admin sign in"}
          className="auth-panel"
        >
          <form onSubmit={auth}>
            <Inputs
              fields={[
                { name: "email", label: "Email", type: "email" },
                {
                  name: "password",
                  label: "Password · at least 8 characters",
                  type: "password",
                },
              ]}
            />
            <button className="primary wide" disabled={busy}>
              {busy ? "Working…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => setSignup(!signup)}
            >
              {signup
                ? "Already have an account? Sign in"
                : "Need an account? Register for approval"}
            </button>
            <p className="muted">
              Account creation never grants admin access. An owner must
              explicitly approve your account.
            </p>
          </form>
        </Panel>
      ) : !authorized ? (
        <Panel title="Account awaiting approval">
          <div className="notebook">
            <ShieldCheck size={32} />
            <h3>You’re signed in, but publishing is locked.</h3>
            <p>
              Tell the owner to approve <b>{session.user.email}</b> for Vegas
              Quant administration. No public content can be changed from this
              account yet.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="admin-status">
            <Badge tone="green">
              <LockKeyhole size={12} />
              APPROVED ADMIN
            </Badge>
            <span>{session.user.email}</span>
            <a href="/" target="_blank" rel="noreferrer">
              Open public site ↗
            </a>
          </div>
          <div className="action-tabs">
            {Object.entries(actionLabels).map(([k, v]) => (
              <button
                className={action === k ? "selected" : ""}
                onClick={() => switchAction(k)}
                key={k}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="admin-grid">
            <Panel
              title={actionLabels[action]}
              aside={<Badge>Append-only publishing</Badge>}
            >
              <form onSubmit={prepare} key={`${action}-${formKey}`}>
                <div className="form-grid">
                  <label className="field">
                    <span>Challenge</span>
                    <select
                      value={challengeId}
                      onChange={(e) => {
                        setChallengeId(e.target.value);
                        setPreview(null);
                      }}
                    >
                      {d.challenges.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.number} · {c.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  {["analysis", "market", "pick", "game"].includes(action) && (
                    <label className="field">
                      <span>Game</span>
                      <select
                        value={gameId}
                        onChange={(e) => {
                          setGameId(e.target.value);
                          setPreview(null);
                          setFormKey((v) => v + 1);
                        }}
                      >
                        {d.games.map((g) => (
                          <option value={g.id} key={g.id}>
                            {g.away_team} @ {g.home_team}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {["entry", "close", "result", "review"].includes(action) && (
                    <label className="field">
                      <span>Official pick</span>
                      <select
                        required
                        value={pickId}
                        onChange={(e) => setPickId(e.target.value)}
                      >
                        <option value="">Select a pick…</option>
                        {d.picks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.selection} · {time(p.created_at)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {action === "game" && (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={editingGame}
                      onChange={(e) => {
                        setEditingGame(e.target.checked);
                        setFormKey((v) => v + 1);
                      }}
                    />
                    Update selected game (previous details preserved in audit)
                  </label>
                )}
                {["pick", "game"].includes(action) && (
                  <label className="field">
                    <span>Challenge stage (or standalone game / pick)</span>
                    <select
                      name="stage_id"
                      defaultValue={action === "pick" ? current?.id || "" : ""}
                    >
                      <option value="">
                        Standalone · separate from challenge bankroll
                      </option>
                      {stages.map((s) => (
                        <option value={s.id} key={s.id}>
                          Stage {s.stage_number} · {s.slot} · {s.status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {action === "analysis" && (
                  <>
                    <Inputs
                      fields={[
                        {
                          name: "title",
                          label: "Version title",
                          placeholder:
                            "Injury report update / initial market read",
                        },
                        {
                          name: "source",
                          label: "Attribution / source",
                          placeholder: "Vegas Quant Ultra / owner handoff",
                        },
                        {
                          name: "raw_handoff",
                          label: "Original analyst handoff · publish exactly",
                          type: "textarea",
                        },
                      ]}
                    />
                    <h3 className="form-divider">Analysis sections</h3>
                    <p className="muted">
                      Leave missing sections blank. Do not fabricate missing
                      analysis.
                    </p>
                    {sectionNames.map((s) => (
                      <details className="admin-section" key={s}>
                        <summary>{s}</summary>
                        <label className="field">
                          <span>
                            {sectionHints[s] ||
                              "Paste the analyst’s exact text."}
                          </span>
                          <textarea name={`section:${s}`} rows={5} />
                        </label>
                      </details>
                    ))}
                    <h3 className="form-divider">
                      Analyst projections & market read
                    </h3>
                    <Inputs
                      fields={projectionFields.map((k) => ({
                        name: `projection:${k}`,
                        label: k.replaceAll("_", " "),
                        required: false,
                      }))}
                    />
                  </>
                )}
                {action === "pick" && (
                  <>
                    <div className="warning-box">
                      Only publish after the owner explicitly confirms the
                      official play. All supplied values are preserved; nothing
                      is inferred or recalculated as analyst opinion.
                    </div>
                    <label className="field">
                      <span>Analysis snapshot to lock *</span>
                      <select name="analysis_id" required>
                        <option value="">Select the source analysis…</option>
                        {analyses.map((a) => (
                          <option key={a.id} value={a.id}>
                            v{a.version} · {a.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className="admin-section">
                      <summary>Import a structured handoff (optional)</summary>
                      <textarea
                        rows={5}
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder='{"selection":"…","odds":-110,"stake":20,…}'
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={importPick}
                      >
                        Fill supplied fields
                      </button>
                    </details>
                  </>
                )}
                <Inputs fields={fields} defaults={defaults} />
                {action === "entry" && (
                  <p className="muted">
                    Stake remains{" "}
                    {pick ? money(pick.stake_cents) : "the published stake"}.
                    Enter the actual number and price. Late recording is
                    timestamped; the published recommendation stays unchanged.
                  </p>
                )}
                {action === "result" && (
                  <div className="warning-box">
                    Confirm the actual bet entry first. Results and money
                    movements are final. Duplicate submission is blocked.
                  </div>
                )}
                {action === "new_challenge" && (
                  <p>
                    A new challenge begins with a separate $20 allocation and
                    five empty stages. The previous challenge must be completed
                    or lost. Nothing from its history is deleted.
                  </p>
                )}
                <div className="form-footer">
                  <button className="primary" disabled={busy}>
                    Review publication
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </Panel>
            <aside>
              <Panel title="Publishing rules">
                <div className="notebook">
                  <p>
                    <b>1.</b> Use only the owner / Vegas Quant Ultra handoff.
                  </p>
                  <p>
                    <b>2.</b> An official pick requires at least 3% stated edge.
                  </p>
                  <p>
                    <b>3.</b> Missing information stays missing. Ask before
                    publishing.
                  </p>
                  <p>
                    <b>4.</b> A pass pauses the challenge. No automatic
                    replacement.
                  </p>
                  <p>
                    <b>5.</b> Previous analysis, picks, closing lines, and
                    results cannot be overwritten.
                  </p>
                  <p>
                    <b>6.</b> Public content updates immediately after a
                    successful publish.
                  </p>
                </div>
              </Panel>
            </aside>
          </div>
          {preview && (
            <section className="publish-review" aria-label="Review publication">
              <div className="panel-head">
                <h2>Review before publishing</h2>
                <Badge tone="gold">PUBLIC CONTENT</Badge>
              </div>
              <p>
                These are the exact fields being published. Confirm the
                analyst’s numbers and wording.
              </p>
              <pre>{JSON.stringify(preview, null, 2)}</pre>
              <div className="panel-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  Back to editing
                </button>
                <button className="primary" disabled={busy} onClick={publish}>
                  {busy ? "Publishing…" : "Confirm & publish"}
                  <CheckCircle2 size={16} />
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}
