"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import SimField from "./sim-field";
import {
  boxScore,
  clockText,
  initials,
  periodText,
  playText,
  shortName,
  situationText,
  statLine,
  type Role,
  type SimRun,
} from "@/lib/game-sim/contract";

const PLAY_MS = 1400;
const ROLE_LABEL: Record<Role, string> = {
  passer: "QB",
  rusher: "Ball carrier",
  target: "Target",
  kicker: "Kicker",
  returner: "Returner",
};
const SPEEDS = [1, 2, 4] as const;
const MODE_LABEL = {
  demo: "DEMO · synthetic game",
  historical_replay: "Historical replay",
  pregame: "Pregame simulation",
  scenario: "Hypothetical scenario",
} as const;
type Tab = "box" | "ranges" | "players" | "scenarios";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function SimulatorView({ run }: { run: SimRun }) {
  const research = run.run_id.startsWith("research:");
  const events = run.events;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [tab, setTab] = useState<Tab>("box");
  const frame = useRef(0);

  // Playback: each play's ball path takes PLAY_MS / speed, then the next play starts. With reduced
  // motion the ball jumps to the end of each play instead of travelling.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let p = progress;
    let i = index;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      // The ball travels for the first part of each play, then holds briefly on the spot.
      p += dt / (PLAY_MS / speed);
      if (p >= 1.35) {
        if (i >= events.length - 1) {
          setProgress(1);
          setPlaying(false);
          return;
        }
        i += 1;
        p = 0;
        setIndex(i);
      }
      setProgress(reduced ? 1 : Math.min(1, p));
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
    // Restart the loop only when play state or speed changes; index/progress are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, reduced, events.length]);

  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(events.length - 1, i)));
    setProgress(1);
  };
  const event = events[index];
  const done = progress >= 1;
  const score = done ? event.score_after : event.score_before;
  const clock = done ? event.clock_after_s : event.clock_before_s;
  const { home, away } = run.game.teams;
  const situation = situationText(run, event);
  const box = useMemo(() => boxScore(run), [run]);
  // Stats as of the play on screen: the current play counts once its animation finishes.
  const statsNow = useMemo(
    () =>
      new Map(
        boxScore(run, done ? index : index - 1).players.map((p) => [
          p.player_id,
          p,
        ]),
      ),
    [run, index, done],
  );
  const onPlay = event.participants.slice(0, 2);
  const recent = events.slice(Math.max(0, index - 3), index).reverse();
  const quarters = [...new Set(events.map((e) => e.period))];

  return (
    <section className="sim" aria-label="Game simulator">
      {run.is_demo && (
        <p className="sim-demo-banner" role="note">
          <strong>Synthetic demo game, not a prediction.</strong> Hand-written
          to test the field and controls. No simulation engine ran, so there are
          no chances or ranges.
        </p>
      )}
      <header className="sim-head">
        <span className={`sim-mode sim-mode-${run.mode}`}>
          {MODE_LABEL[run.mode]}
        </span>
        <h2>
          {away.abbr} at {home.abbr}
        </h2>
        <p>
          {away.name} at {home.name}
        </p>
      </header>

      <div className="sim-board" aria-live="polite">
        <div className="sim-team">
          <span>{away.abbr}</span>
          <b>{score.away}</b>
          {event.possession === "away" && <i aria-label="has the ball">●</i>}
        </div>
        <div className="sim-clock">
          <b>{periodText(event.period)}</b>
          <span>{clockText(clock)}</span>
        </div>
        <div className="sim-team">
          <span>{home.abbr}</span>
          <b>{score.home}</b>
          {event.possession === "home" && <i aria-label="has the ball">●</i>}
        </div>
        <p className="sim-situation">{situation ?? " "}</p>
      </div>

      {onPlay.length > 0 && (
        <ul className="sim-cards" aria-label="Players on this play">
          {onPlay.map((p) => (
            <li
              key={`${p.role}-${p.player_id}`}
              className={`sim-card sim-card-${p.team}`}
            >
              <span className="sim-card-ini" aria-hidden="true">
                {initials(p.name)}
              </span>
              <span>
                <b>{shortName(p.name)}</b>
                <small>
                  {statLine(statsNow.get(p.player_id), p.role) ||
                    ROLE_LABEL[p.role]}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <SimField run={run} event={event} progress={reduced ? 1 : progress} />

      <div className="sim-ticker" aria-live="polite">
        <p className="sim-now">
          <span>
            {periodText(event.period)} {clockText(event.clock_before_s)}
          </span>{" "}
          {playText(run, event)}
        </p>
        {recent.length > 0 && (
          <ol className="sim-recent" aria-label="Previous plays">
            {recent.map((e) => (
              <li key={e.sequence}>{playText(run, e)}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="sim-controls" role="group" aria-label="Playback">
        <button
          type="button"
          aria-label="Previous play"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          className="sim-play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && index >= events.length - 1 && done) {
              setIndex(0);
              setProgress(0);
            } else if (!playing && done) {
              setIndex(index + 1);
              setProgress(0);
            }
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button
          type="button"
          aria-label="Next play"
          onClick={() => go(index + 1)}
          disabled={index >= events.length - 1}
        >
          <SkipForward size={18} />
        </button>
        <div className="sim-speed" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              className={speed === s ? "on" : ""}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <label className="sim-scrub">
        <span>
          Play {index + 1} of {events.length}
        </span>
        <input
          type="range"
          min={0}
          max={events.length - 1}
          value={index}
          aria-label="Choose play"
          onChange={(e) => go(Number(e.target.value))}
        />
      </label>
      <div className="sim-quarters" role="group" aria-label="Jump to quarter">
        {quarters.map((q) => (
          <button
            key={q}
            type="button"
            className={event.period === q ? "on" : ""}
            onClick={() => go(events.findIndex((e) => e.period === q))}
          >
            {periodText(q)}
          </button>
        ))}
      </div>

      <div className="sim-tabs" role="tablist" aria-label="Simulation details">
        {(
          [
            ["box", "Box score"],
            ["ranges", "Ranges"],
            ["players", "Players"],
            ["scenarios", "Scenarios"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`sim-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="sim-panel"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="sim-panel"
        id="sim-panel"
        role="tabpanel"
        aria-labelledby={`sim-tab-${tab}`}
      >
        {tab === "box" && (
          <>
            <p className="sim-fine">
              {research
                ? "This league baseline does not provide complete player or team credited-stat boxes. Scores are shown above; yard/turnover totals remain unavailable."
                : "Every number below is counted from the plays in this game."}
            </p>
            <table className="sim-table">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">Plays</th>
                  <th scope="col">Yards</th>
                  <th scope="col">Turnovers</th>
                </tr>
              </thead>
              <tbody>
                {(["away", "home"] as const).map((s) => (
                  <tr key={s}>
                    <th scope="row">{run.game.teams[s].abbr}</th>
                    <td>{research ? "Unavailable" : box.team[s].plays}</td>
                    <td>{research ? "Unavailable" : box.team[s].yards}</td>
                    <td>{research ? "Unavailable" : box.team[s].turnovers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="sim-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Passing</th>
                  <th scope="col">Rushing</th>
                  <th scope="col">Receiving</th>
                </tr>
              </thead>
              <tbody>
                {box.players.map((p) => (
                  <tr key={p.player_id}>
                    <th scope="row">
                      {p.name} <small>{run.game.teams[p.team].abbr}</small>
                    </th>
                    <td>
                      {p.passing.att
                        ? `${p.passing.comp}/${p.passing.att} · ${p.passing.yds} · ${p.passing.td} TD${p.passing.int ? ` · ${p.passing.int} INT` : ""}`
                        : "–"}
                    </td>
                    <td>
                      {p.rushing.att
                        ? `${p.rushing.att} · ${p.rushing.yds} · ${p.rushing.td} TD`
                        : "–"}
                    </td>
                    <td>
                      {p.receiving.rec
                        ? `${p.receiving.rec} · ${p.receiving.yds} · ${p.receiving.td} TD`
                        : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {tab === "ranges" &&
          (run.distributions ? (
            <Ranges run={run} />
          ) : (
            <p className="sim-empty">
              No ranges for this game. Score, margin and total ranges appear
              only from a recorded engine run, never from the screen.
            </p>
          ))}
        {tab === "players" &&
          (run.distributions?.players.length ? (
            <ul className="sim-players">
              {run.distributions.players.map((p) => (
                <li key={`${p.player_id}-${p.stat}`}>
                  <strong>{p.name}</strong> · {p.stat}{" "}
                  {p.supported && p.quantiles ? (
                    <span>
                      middle half {p.quantiles.p25}–{p.quantiles.p75} · median{" "}
                      {p.quantiles.p50} · {p.n} runs
                    </span>
                  ) : (
                    <span className="sim-unsupported">
                      Unsupported · {p.unsupported_reason ?? "no reason given"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sim-empty">
              No player ranges for this game. They appear only where the engine
              supports the stat.
            </p>
          ))}
        {tab === "scenarios" &&
          (run.scenario ? (
            <div>
              <p>
                <strong>Hypothetical · {run.scenario.label}</strong>
              </p>
              <ul>
                {run.scenario.adjustments.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="sim-empty">
              No scenario runs yet. Scenarios will be separate engine runs,
              labeled hypothetical and never mixed into the baseline.
            </p>
          ))}
      </div>

      <details className="sim-list">
        <summary>All {events.length} plays</summary>
        <ol>
          {events.map((e, i) => (
            <li key={e.sequence}>
              <button
                type="button"
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
              >
                <span>
                  {periodText(e.period)} {clockText(e.clock_before_s)}
                </span>{" "}
                {playText(run, e)}
              </button>
            </li>
          ))}
        </ol>
      </details>

      <footer className="sim-meta">
        <p>
          <strong>How this game was chosen:</strong>{" "}
          {run.replay.selection.description}
        </p>
        <p>
          Runs {run.runs.actual.toLocaleString()} of{" "}
          {run.runs.requested.toLocaleString()} · seed{" "}
          {run.replay.seed ?? "none"} · model {run.model_version}
          {run.artifact_hash && ` · ${run.artifact_hash}`}
          {run.historical_cutoff && ` · data through ${run.historical_cutoff}`}
        </p>
        <p>Research only · not a pick · no EV or edge.</p>
      </footer>
    </section>
  );
}

function Ranges({ run }: { run: SimRun }) {
  const d = run.distributions!;
  const { home, away } = run.game.teams;
  const rows = [
    [`${away.abbr} points`, d.away_score],
    [`${home.abbr} points`, d.home_score],
    [`Margin (${home.abbr} − ${away.abbr})`, d.margin],
    ["Total points", d.total],
  ] as const;
  return (
    <>
      <p>
        {home.abbr} won {d.home_win.count.toLocaleString()} of{" "}
        {d.home_win.n.toLocaleString()} simulated games.
      </p>
      {rows.map(([label, dist]) => {
        const max = Math.max(...dist.bins.map((b) => b.count));
        return (
          <figure key={label} className="sim-range">
            <figcaption>
              {label} · median {dist.quantiles.p50} · middle half{" "}
              {dist.quantiles.p25}–{dist.quantiles.p75} · 90%{" "}
              {dist.quantiles.p5}–{dist.quantiles.p95}
            </figcaption>
            <div className="sim-bins" aria-hidden="true">
              {dist.bins.map((b) => (
                <span
                  key={b.lo}
                  style={{ height: `${(b.count / max) * 100}%` }}
                />
              ))}
            </div>
          </figure>
        );
      })}
    </>
  );
}
