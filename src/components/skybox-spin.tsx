"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import BrandMark from "./brand-mark";
import SkyboxFace from "./skybox-face";
import { SPORTS, type Sport } from "@/lib/sports";
import { startLabel, statusLabel } from "@/lib/vq-tonight";
import { nhlHeld, subscribeNhlHold } from "@/lib/frank-hold";
import {
  SPIN_ORDER,
  SPIN_STORAGE_KEY,
  classifyGesture,
  dragDegrees,
  parseSpinMode,
  ringRadius,
  settleStep,
  spinFaces,
  wrap,
  type FaceState,
  type SpinMode,
} from "@/lib/skybox-spin";
import "@/app/skybox-spin.css";

const PREVIEW = 3;
const clock = (t: number) =>
  `${new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
/** Clicks this soon after a drag ends are the drag's own click, never a tap on a game. */
const CLICK_GUARD_MS = 450;

type Props = {
  day: { label: string };
  faceState: (sport: Sport) => FaceState;
  /** Re-read one client sport (NBA, NHL, NCAAB). NFL re-renders the server desk instead. */
  onRetry: (sport: Exclude<Sport, "nfl">) => void;
  /** The approved hanging enclosure, drawn once per face. Decorative only. */
  enclosure: () => ReactNode;
  /** The All sports board, shown unchanged when no sport face is chosen. */
  overview: ReactNode;
};

type Drag = {
  id: number;
  x: number;
  y: number;
  kind: "pending" | "horizontal" | "vertical";
  dx: number;
  lastX: number;
  lastT: number;
  v: number;
};

const reducedQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia(reducedQuery);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

/**
 * The turning VQ Skybox: one face per sport inside the approved enclosure, plus the All sports
 * overview. Every face is real HTML built from the schedules Home already read, so turning never
 * fetches. Only the face in front is interactive or announced; the others are inert.
 */
export default function SkyboxSpin({ day, faceState, onRetry, enclosure, overview }: Props) {
  const router = useRouter();
  const reduced = useReducedMotion();
  // NHL keeps its sport-chip access rule: while held it is not a face at all.
  const held = useSyncExternalStore(subscribeNhlHold, nhlHeld, () => true);
  const faces = spinFaces(!held);
  const n = faces.length;
  const step = 360 / n;

  // The chosen view. A face that is not currently allowed (NHL held) shows the overview.
  const [choice, setChoice] = useState<SpinMode>("overview");
  const mode: SpinMode = choice === "overview" || faces.includes(choice) ? choice : "overview";
  const index = mode === "overview" ? -1 : faces.indexOf(mode);
  // Whole turns made so far, so "next" from the last face keeps turning the same way.
  const [turns, setTurns] = useState(0);
  // A change that must not animate: restoring, entering from the overview, faces changing.
  const [snap, setSnap] = useState(true);
  const [expanded, setExpanded] = useState<Partial<Record<Sport, boolean>>>({});
  const [announce, setAnnounce] = useState("");

  // Return from a game to the face the user left (this tab only; no history entries).
  useEffect(() => {
    try {
      const saved = parseSpinMode(sessionStorage.getItem(SPIN_STORAGE_KEY), SPIN_ORDER);
      if (saved !== "overview") setChoice(saved);
    } catch {
      /* storage blocked: start on the overview */
    }
  }, []);
  const remember = (m: SpinMode) => {
    try {
      sessionStorage.setItem(SPIN_STORAGE_KEY, m);
    } catch {
      /* storage blocked: the choice lasts this visit only */
    }
  };

  // The hero's "All sports" link keeps meaning the overview.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="#vq-tonight"]');
      if (a && !a.closest(".vq-spin")) {
        setSnap(true);
        setChoice("overview");
        remember("overview");
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const describe = useCallback(
    (m: SpinMode) => {
      if (m === "overview") return "All sports overview";
      const s = faceState(m);
      const where = `${SPORTS[m].label}, face ${faces.indexOf(m) + 1} of ${n}`;
      if (s.kind === "loading") return `${where}. Loading today’s games.`;
      if (s.kind === "unavailable") return `${where}. Games unavailable right now.`;
      const c = s.games.length;
      return `${where}. ${c ? `${c} game${c === 1 ? "" : "s"} today` : "No games scheduled today"}.`;
    },
    [faceState, faces, n],
  );

  const go = useCallback(
    (m: SpinMode, opts: { snap?: boolean; dir?: -1 | 1 } = {}) => {
      if (m !== "overview" && opts.dir && index >= 0) {
        // Crossing the seam keeps the turn going the way it was asked.
        const to = faces.indexOf(m);
        if (opts.dir === 1 && to < index) setTurns((t) => t + 1);
        if (opts.dir === -1 && to > index) setTurns((t) => t - 1);
      }
      setSnap(Boolean(opts.snap) || mode === "overview" || m === "overview");
      setChoice(m);
      remember(m);
      setAnnounce(describe(m));
    },
    [describe, faces, index, mode],
  );
  const turn = useCallback(
    (dir: -1 | 1) => {
      if (mode === "overview") return go(dir === 1 ? faces[0] : faces[n - 1], { dir });
      go(faces[wrap(index + dir, n)], { dir });
    },
    [faces, go, index, mode, n],
  );

  // Faces appearing or leaving (NHL hold) re-seat the ring without a spin.
  const lastN = useRef(n);
  useEffect(() => {
    if (lastN.current !== n) {
      lastN.current = n;
      setSnap(true);
    }
  }, [n]);

  // Ring geometry follows the stage width.
  const stage = useRef<HTMLDivElement>(null);
  const prism = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode === "overview"]);

  const angle = index < 0 ? 0 : -(turns * n + index) * step;
  const radius = ringRadius(width, n);
  const place = useCallback(
    (deg: number) => {
      const el = prism.current;
      if (el) el.style.transform = `translateZ(${-radius}px) rotateY(${deg}deg)`;
    },
    [radius],
  );
  useLayoutEffect(() => {
    place(angle);
  }, [angle, place, mode]);
  // A snapped change lands without animating; the next change animates again.
  useEffect(() => {
    if (!snap) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false)));
    return () => cancelAnimationFrame(id);
  }, [snap, angle]);

  // Gesture: a tap stays a tap; a clearly horizontal drag turns; vertical stays the page's scroll.
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragEnded = useRef(0);
  const end = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "horizontal") return;
    setDragging(false);
    dragEnded.current = Date.now();
    const s = commit ? settleStep(d.dx, d.v, width) : 0;
    if (s) turn(s);
    else place(angle); // snap back to the face in front
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      // A second finger is a pinch, never a turn.
      const was = drag.current;
      drag.current = null;
      if (was.kind === "horizontal") {
        setDragging(false);
        place(angle);
      }
      return;
    }
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    dragEnded.current = 0;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: "pending", dx: 0, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.kind === "vertical") return;
    const dx = e.clientX - d.x;
    if (d.kind === "pending") {
      d.kind = classifyGesture(dx, e.clientY - d.y);
      if (d.kind === "vertical") return;
      if (d.kind === "pending") return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDragging(true);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = d.v * 0.3 + ((e.clientX - d.lastX) / dt) * 0.7;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    d.dx = dx;
    // Reduced motion: no live rotation; the release still settles on a face.
    if (!reduced && index >= 0) place(angle + dragDegrees(dx, width, n));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) end(true);
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) end(false);
  };
  // A drag that ends over a game link must not open it.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (dragEnded.current && Date.now() - dragEnded.current < CLICK_GUARD_MS) {
      e.preventDefault();
      e.stopPropagation();
    }
    dragEnded.current = 0;
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      turn(e.key === "ArrowRight" ? 1 : -1);
    }
  };

  const options: SpinMode[] = ["overview", ...faces];
  const label = (m: SpinMode) => (m === "overview" ? "All sports" : SPORTS[m].label);

  return (
    <div
      className={`vq-spin${dragging ? " is-dragging" : ""}${snap || reduced ? " is-snap" : ""}`}
      data-spin-mode={mode}
      data-spin-faces={faces.join(",")}
    >
      <div className="vq-spin-picks" role="group" aria-label="Scoreboard face" onKeyDown={onKeyDown}>
        {options.map((m) => (
          <button
            key={m}
            type="button"
            className="vq-spin-pick"
            data-spin-pick={m}
            aria-pressed={mode === m}
            onClick={() => (mode === m ? undefined : go(m, { dir: m !== "overview" && index >= 0 ? (faces.indexOf(m) > index ? 1 : -1) : undefined }))}
          >
            {label(m)}
          </button>
        ))}
      </div>
      <p className="vq-spin-live" role="status" aria-live="polite">
        {announce}
      </p>

      <div className="vq-spin-body">
      <button type="button" className="vq-spin-arrow vq-spin-prev" onClick={() => turn(-1)} onKeyDown={onKeyDown} aria-label={`Previous face: ${label(mode === "overview" ? faces[n - 1] : faces[wrap(index - 1, n)])}`}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <div
        ref={stage}
        className="vq-spin-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // Only the stage's own capture ending is a cancel; a touch's implicit capture moving from the
        // touched element to the stage also fires this, bubbling from that element.
        onLostPointerCapture={(e) => e.target === e.currentTarget && onPointerCancel(e)}
        onClickCapture={onClickCapture}
        // A link's native drag-and-drop would cancel the turn mid-gesture.
        onDragStart={(e) => e.preventDefault()}
      >
        {mode === "overview" ? (
          overview
        ) : (
          <div ref={prism} className="vq-spin-prism" style={{ ["--spin-r" as string]: `${radius}px` }}>
            {faces.map((s, i) => {
              const front = i === index;
              return (
                <div
                  key={s}
                  className="vq-spin-face"
                  data-front={front || undefined}
                  style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}
                  inert={!front}
                  aria-hidden={front ? undefined : true}
                >
                  <SportFace
                    sport={s}
                    position={i + 1}
                    count={n}
                    front={front}
                    day={day}
                    state={faceState(s)}
                    enclosure={enclosure}
                    expanded={Boolean(expanded[s])}
                    onExpand={() => setExpanded((x) => ({ ...x, [s]: !x[s] }))}
                    onRetry={() => (s === "nfl" ? router.refresh() : onRetry(s))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" className="vq-spin-arrow vq-spin-next" onClick={() => turn(1)} onKeyDown={onKeyDown} aria-label={`Next face: ${label(mode === "overview" ? faces[0] : faces[wrap(index + 1, n)])}`}>
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      </div>
    </div>
  );
}

function SportFace({
  sport,
  position,
  count,
  front,
  day,
  state,
  enclosure,
  expanded,
  onExpand,
  onRetry,
}: {
  sport: Sport;
  position: number;
  count: number;
  front: boolean;
  day: { label: string };
  state: FaceState;
  enclosure: () => ReactNode;
  expanded: boolean;
  onExpand: () => void;
  onRetry: () => void;
}) {
  const info = SPORTS[sport];
  const games = state.kind === "ready" ? state.games : [];
  const shown = expanded ? games : games.slice(0, PREVIEW);
  return (
    <SkyboxFace faceId={sport}>
      {enclosure()}
      <header className="vq-tonight-head">
        {/* The front face names the whole Skybox section for assistive tech. */}
        <h2 id={front ? "vq-tonight-title" : undefined} aria-label={`VQ Tonight, ${info.name}`}>
          <BrandMark />
          <span className="vq-tonight-brand-text">VQ </span>
          {info.label}
        </h2>
        <p>Today · {day.label} · ET</p>
        <p className="vq-spin-index">
          Face {position} of {count}
          {state.kind === "ready" ? ` · ${games.length} game${games.length === 1 ? "" : "s"} today` : ""}
        </p>
      </header>

      {state.kind === "loading" ? (
        <p className="vq-tonight-empty" role="status">
          Loading today’s {info.label} games…
        </p>
      ) : state.kind === "unavailable" ? (
        <p className="vq-tonight-alert" role="alert" data-spin-state="unavailable">
          {info.label} games are unavailable right now. This is not the same as no games.{" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : (
        <>
          {state.stale ? (
            <p className="vq-tonight-alert" role="alert" data-spin-state="stale">
              Couldn’t refresh {info.label}
              {state.checkedAt ? `: showing games as checked ${clock(state.checkedAt)}` : ""}, which may be out of date.{" "}
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </p>
          ) : null}
          {games.length ? (
            <div className="vq-tonight-games">
              <div className="vq-tonight-sport">
              <ul>
                {shown.map((g) => {
                  const status = statusLabel(g.status);
                  return (
                    <li key={g.id}>
                      <Link
                        href={g.href}
                        className="vq-tonight-game vq-spin-game"
                        aria-label={`${g.away} at ${g.home}, ${status ?? startLabel(g)}. Open the game page`}
                      >
                        <span className="vq-tonight-teams">
                          {g.away} <small>@</small> {g.home}
                        </span>
                        <span className="vq-tonight-when">
                          {status ? (
                            <b>{status}</b>
                          ) : (
                            <>
                              <span className="vq-tonight-day">Today</span>
                              <span>{startLabel(g)}</span>
                            </>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              </div>
            </div>
          ) : (
            <p className="vq-tonight-empty" role="status" data-spin-state="empty">
              No {info.label} games are scheduled today.
            </p>
          )}
        </>
      )}

      <div className="vq-spin-actions">
        {games.length > PREVIEW ? (
          <button type="button" className="vq-tonight-more" aria-expanded={expanded} onClick={onExpand}>
            {expanded ? `Show fewer ${info.label} games` : `Show all ${games.length} ${info.label} games`}
          </button>
        ) : null}
        <Link href={info.home} className="vq-spin-open">
          Open {info.label} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {state.kind === "ready" && state.checkedAt ? (
        <p className="vq-tonight-checked vq-tonight-screen-note">Schedule checked {clock(state.checkedAt)} · League times and statuses at that check.</p>
      ) : null}
    </SkyboxFace>
  );
}
