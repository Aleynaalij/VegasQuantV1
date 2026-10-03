"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  canCheckIn,
  runMessage,
  stageLabels,
  type Run,
  type JourneyStage,
} from "@/lib/challenge-run";
import RunShare from "./run-share";
export default function ChallengeRun({
  challenge,
  stages,
  member = false,
  onMode,
}: {
  challenge: {
    id: string;
    number: number;
    current_stage: number;
    status: string;
  };
  stages: JourneyStage[];
  member?: boolean;
  onMode?: (mode: "follow" | "track") => void;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [user, setUser] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [checks, setChecks] = useState<number[]>([]),
    [count, setCount] = useState<number | null>(null),
    [selected, setSelected] = useState(challenge.current_stage),
    [mode, setMode] = useState<"follow" | "track">("follow"),
    [countMe, setCountMe] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    epoch = useRef(0),
    callback = useRef(onMode);
  callback.current = onMode;
  async function refreshCount() {
    const r = await supabase.rpc("challenge_community_count", {
      p_challenge_id: challenge.id,
    });
    if (!r.error) setCount(Number(r.data));
  }
  useEffect(() => {
    let alive = true;
    async function load() {
      const generation = ++epoch.current;
      setLoading(true);
      setRun(null);
      setChecks([]);
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id || null;
      if (!alive || generation !== epoch.current) return;
      setUser(uid);
      if (uid) {
        const [r, c] = await Promise.all([
          supabase
            .from("challenge_runs")
            .select("*")
            .eq("user_id", uid)
            .eq("challenge_id", challenge.id)
            .maybeSingle(),
          supabase
            .from("challenge_checkins")
            .select("stage_number")
            .eq("user_id", uid)
            .eq("challenge_id", challenge.id),
        ]);
        if (!alive || generation !== epoch.current) return;
        if (r.error || c.error)
          setNotice("Could not load your run. Refresh to try again.");
        else {
          setRun(r.data);
          setChecks((c.data || []).map((x) => x.stage_number));
          if (r.data) {
            setMode(r.data.mode);
            setCountMe(r.data.count_me);
            callback.current?.(r.data.mode);
          }
        }
      }
      setLoading(false);
    }
    void load();
    void refreshCount();
    const listener = supabase.auth.onAuthStateChange(() => {
      epoch.current++;
      setRun(null);
      setUser(null);
      setChecks([]);
      setTimeout(() => {
        if (alive) void load();
      }, 0);
    });
    return () => {
      alive = false;
      epoch.current++;
      listener.data.subscription.unsubscribe();
    };
  }, [challenge.id]);
  useEffect(
    () => setSelected(challenge.current_stage),
    [challenge.current_stage],
  );
  async function save() {
    if (!user) {
      sessionStorage.setItem("vq-join-challenge", challenge.id);
      location.assign("/membership?join=challenge");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const r = await supabase.rpc("set_challenge_run", {
        p_challenge_id: challenge.id,
        p_mode: mode,
        p_count_me: countMe,
      });
      if (r.error) throw r.error;
      setRun(r.data);
      callback.current?.(mode);
      dialog.current?.close();
      await refreshCount();
      setNotice("You’re in. Your run is saved.");
    } catch (e) {
      setNotice(
        (e as { message: string }).message || "Could not save your run.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function checkIn() {
    setBusy(true);
    setNotice("");
    const r = await supabase.rpc("check_in_challenge", {
      p_challenge_id: challenge.id,
      p_stage_number: selected,
    });
    if (r.error) setNotice(r.error.message);
    else {
      setChecks((v) => Array.from(new Set([...v, selected])));
      setNotice("Stage followed. No wager was recorded.");
    }
    setBusy(false);
  }
  const selectedStage = stages.find((s) => s.stage_number === selected),
    msg = runMessage(challenge.status),
    followed = checks.length;
  function open() {
    setMode(run?.mode || "follow");
    setCountMe(run?.count_me || false);
    dialog.current?.showModal();
  }
  return (
    <section
      className={`challenge-run ${run ? "joined" : "not-joined"}`}
      aria-label="Your challenge run"
    >
      <div className="run-heading">
        <span className="eyebrow">
          {run ? "YOUR RUN" : "FIVE STAGES. YOUR CALL."} · CHALLENGE #
          {challenge.number}
        </span>
        {run && (
          <button className="text-link" onClick={open}>
            Run settings
          </button>
        )}
      </div>
      <h1>
        {run ? (
          "The 5-Spot Challenge"
        ) : (
          <>
            Five stages.
            <br />
            Make your run.
          </>
        )}
      </h1>
      <p className="run-intro">
        {run
          ? run.mode === "follow"
            ? "Following along · no wager required"
            : "Tracking my bets · actual entries only"
          : "The 5-Spot Challenge. Start with $20, follow the research and track every decision."}
      </p>
      {!run && (
        <>
          <button
            className="primary join-run"
            disabled={loading}
            onClick={open}
          >
            {loading ? "Loading your run…" : "Join the Challenge →"}
          </button>
          <p className="run-free">
            Free to follow. No wager required. Detailed picks and research
            require a research membership.
          </p>
        </>
      )}
      <div className="journey" aria-label="Five-stage journey">
        {stageLabels.map((label, i) => {
          const n = i + 1,
            s = stages.find((s) => s.stage_number === n),
            won = s?.status === "WON",
            done = checks.includes(n),
            current = n === challenge.current_stage;
          return (
            <button
              key={n}
              aria-label={`Stage ${n}: ${label}, ${done ? "followed" : s?.status || "upcoming"}`}
              aria-pressed={selected === n}
              className={`journey-stop ${current ? "current" : ""} ${done || won ? "followed" : ""} ${selected === n ? "selected" : ""}`}
              onClick={(e) => {
                setSelected(n);
                const tools = e.currentTarget
                  .closest("section")
                  ?.querySelector("details.run-actions");
                if (tools) tools.setAttribute("open", "");
              }}
            >
              <span className="journey-dot">{done || won ? "✓" : n}</span>
              <span>{label}</span>
              <small>
                {won
                  ? "Won"
                  : done
                    ? "Followed"
                    : current
                      ? "Current"
                      : "Stage " + n}
              </small>
            </button>
          );
        })}
      </div>
      <details className="run-actions" open={run && member ? undefined : true}>
        <summary>Stage check-in & sharing · {followed}/5 followed</summary>
        {run && (
          <div className="run-progress">
            <span>
              {followed === 5
                ? "✓ Five decisions followed"
                : `${followed}/5 stages followed`}
            </span>
            <span>
              {selectedStage?.status === "PASS / PAUSED"
                ? "Pausing is a valid decision"
                : selectedStage?.status || "Upcoming"}
            </span>
          </div>
        )}
        {(!run || selected === challenge.current_stage) && (
          <div className="run-next">
            <h2>{msg.title}</h2>
            <p>
              {!member && challenge.status === "OFFICIAL PLAY"
                ? "Members can view the official slip. Join free to follow the challenge’s progress."
                : msg.body}
            </p>
          </div>
        )}
        {run && selected !== challenge.current_stage && (
          <div className="run-next">
            <h2>{stageLabels[selected - 1]}</h2>
            <p>
              {selectedStage?.status || "Upcoming"} ·{" "}
              {selected > challenge.current_stage
                ? "Waiting for this stage."
                : "You can revisit this decision in Records."}
            </p>
          </div>
        )}
        {run &&
          selected <= challenge.current_stage &&
          canCheckIn(selectedStage?.status || "") &&
          !checks.includes(selected) && (
            <button className="secondary" disabled={busy} onClick={checkIn}>
              Mark stage {selected} followed ✓
            </button>
          )}
        {run && (
          <>
            <p className="run-free">
              Check-ins track participation—not wins or bets.{" "}
              {run.mode === "track"
                ? "Record a wager only after placing it."
                : ""}
            </p>
            {run.mode === "track" && !member && (
              <Link href="/membership">
                View membership to unlock the official slip →
              </Link>
            )}
            <RunShare
              number={challenge.number}
              checks={checks}
              status={challenge.status}
              challengeId={challenge.id}
            />
          </>
        )}
        {count !== null && count >= 3 && (
          <p className="run-community">
            {count === null
              ? "Community count unavailable"
              : count === 0
                ? "Make it a shared experience. Invite a friend."
                : `${count} ${count === 1 ? "person has" : "people have"} opted in to the community count.`}
          </p>
        )}
      </details>
      {notice && (
        <p role="status" className="run-notice">
          {notice}
        </p>
      )}
      <dialog
        ref={dialog}
        className="entry-dialog"
        aria-labelledby="join-title"
      >
        <div className="member-form">
          <span className="eyebrow">YOUR CHALLENGE, YOUR WAY</span>
          <h2 id="join-title">
            {run ? "Your run settings" : "How do you want to join?"}
          </h2>
          <div className="join-choices">
            <button
              className={mode === "follow" ? "selected" : ""}
              aria-pressed={mode === "follow"}
              onClick={() => setMode("follow")}
            >
              <strong>Follow Along</strong>
              <span>
                Follow the five decisions and check in at each stage. Free. No
                money at stake.
              </span>
            </button>
            <button
              className={mode === "track" ? "selected" : ""}
              aria-pressed={mode === "track"}
              onClick={() => setMode("track")}
            >
              <strong>Track My Bets</strong>
              <span>
                Record wagers you already placed. Your actual prices, stakes and
                results stay separate.
              </span>
            </button>
          </div>
          <label className="entry-confirm">
            <input
              type="checkbox"
              checked={countMe}
              onChange={(e) => setCountMe(e.target.checked)}
            />{" "}
            Include me in the anonymous community count (optional).
          </label>
          <small>
            No names, stakes or balances appear in the community count or run
            share card. Joining does not buy a pass or place a wager.
          </small>
          {notice && <p role="alert">{notice}</p>}
          <button className="primary" disabled={busy} onClick={save}>
            {busy
              ? "Saving…"
              : !user
                ? "Create account / sign in →"
                : run
                  ? "Save settings"
                  : "Start my run →"}
          </button>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
        </div>
      </dialog>
    </section>
  );
}
