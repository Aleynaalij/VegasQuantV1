import {
  initials,
  shortName,
  type Role,
  type SimEvent,
  type SimRun,
} from "@/lib/game-sim/contract";

// A 2D field drawn in yards: 10-yard end zones either side of 100 yards, 53.3 yards wide. The home
// goal line is on the left, matching the contract's home-relative ball_*_x. Only the ball, the
// lines it implies and the play's named participants are drawn, each at a spot the play itself
// gives (snap, ball, catch or landing point). The contract has no formations, so none are invented.
const W = 120,
  H = 53.3;
const fx = (x: number) => 10 + x;

export default function SimField({
  run,
  event,
  progress,
}: {
  run: SimRun;
  event: SimEvent | undefined;
  /** 0 → 1 through the current play's ball path. */
  progress: number;
}) {
  const { home, away } = run.game.teams;
  const start = event?.ball_start_x ?? null;
  const end = event?.ball_end_x ?? start;
  const pass =
    event &&
    [
      "pass_complete",
      "pass_incomplete",
      "interception",
      "punt",
      "kickoff",
      "field_goal",
      "extra_point",
    ].includes(event.play_type);
  const t = Math.min(1, Math.max(0, progress));
  const x = start == null || end == null ? null : start + (end - start) * t;
  // Passes and kicks travel in an arc; runs stay on the ground.
  const lift = pass
    ? Math.sin(Math.PI * t) *
      Math.min(14, 4 + Math.abs((end ?? 0) - (start ?? 0)) / 3)
    : 0;
  const dir = event?.possession === "home" ? 1 : -1;
  const firstDown =
    event && start != null && event.down != null && event.distance != null
      ? Math.min(100, Math.max(0, start + dir * event.distance))
      : null;
  const scored = event?.touchdown && t >= 1;
  const chips =
    event && x != null && start != null
      ? playerSpots(event, start, end ?? start, x, dir)
      : [];
  return (
    <svg
      className="sim-field"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        x == null
          ? `${away.abbr} at ${home.abbr} field`
          : `Ball at the ${x <= 50 ? home.abbr : away.abbr} ${Math.round(x <= 50 ? x : 100 - x)}`
      }
    >
      <rect className="sim-turf" x="0" y="0" width={W} height={H} />
      <rect
        className={`sim-endzone${event?.possession === "away" && scored ? " lit" : ""}`}
        x="0"
        y="0"
        width="10"
        height={H}
      />
      <rect
        className={`sim-endzone${event?.possession === "home" && scored ? " lit" : ""}`}
        x="110"
        y="0"
        width="10"
        height={H}
      />
      <text
        className="sim-endzone-label"
        x="5"
        y={H / 2}
        transform={`rotate(-90 5 ${H / 2})`}
      >
        {home.abbr}
      </text>
      <text
        className="sim-endzone-label"
        x="115"
        y={H / 2}
        transform={`rotate(90 115 ${H / 2})`}
      >
        {away.abbr}
      </text>
      {Array.from({ length: 21 }, (_, i) => i * 5).map((yd) => (
        <line
          key={yd}
          className={yd % 10 ? "sim-line minor" : "sim-line"}
          x1={fx(yd)}
          x2={fx(yd)}
          y1="0"
          y2={H}
        />
      ))}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
        <text key={yd} className="sim-number" x={fx(yd)} y={H - 4}>
          {yd <= 50 ? yd : 100 - yd}
        </text>
      ))}
      {start != null && event?.down != null && (
        <line className="sim-los" x1={fx(start)} x2={fx(start)} y1="0" y2={H} />
      )}
      {firstDown != null && (
        <line
          className="sim-first-down"
          x1={fx(firstDown)}
          x2={fx(firstDown)}
          y1="0"
          y2={H}
        />
      )}
      {x != null && start != null && t > 0 && (
        <line
          className="sim-path"
          x1={fx(start)}
          x2={fx(x)}
          y1={H / 2}
          y2={H / 2 - lift}
        />
      )}
      {/* A second participant sits on the far side of the ball's line so labels never collide. */}
      {chips.map((c, i) => (
        <g
          key={`${c.role}-${c.player_id}`}
          className={`sim-chip sim-chip-${c.team}`}
          transform={`translate(${fx(c.x)} ${i ? H / 2 - 10 : H / 2 + 5})`}
        >
          <circle r="2.6" />
          <text className="sim-chip-ini" y="0.1">
            {initials(c.name)}
          </text>
          <text className="sim-chip-name" y="4.6">
            {shortName(c.name)}
          </text>
        </g>
      ))}
      {x != null && (
        <g
          className="sim-ball"
          transform={`translate(${fx(x)} ${H / 2 - lift})`}
        >
          <ellipse rx="1.6" ry="1" />
          <line x1="-0.6" x2="0.6" y1="0" y2="0" />
        </g>
      )}
      {event && (
        <text
          className="sim-possession"
          x={event.possession === "home" ? 13 : W - 13}
          y="6"
        >
          {event.possession === "home" ? `${home.abbr} ▶` : `◀ ${away.abbr}`}
        </text>
      )}
    </svg>
  );
}

/** Where each named participant stands, using only spots the play provides. */
function playerSpots(
  e: SimEvent,
  start: number,
  end: number,
  ball: number,
  dir: number,
) {
  const who = (role: Role) => e.participants.find((p) => p.role === role);
  const at = (role: Role, x: number) => {
    const p = who(role);
    return p ? [{ ...p, x: Math.min(100, Math.max(0, x)) }] : [];
  };
  switch (e.play_type) {
    case "run":
    case "fumble_lost":
      return at("rusher", ball);
    case "kneel":
    case "spike":
    case "sack":
      return at("passer", ball);
    case "pass_complete":
    case "pass_incomplete":
      // The passer sets up a few yards behind the line; the target waits at the catch point.
      return [...at("passer", start - dir * 4), ...at("target", end)];
    case "interception":
      return at("passer", start - dir * 4);
    case "kickoff":
    case "punt":
      return [...at("kicker", start), ...at("returner", end)];
    case "field_goal":
    case "extra_point":
      return at("kicker", start - dir * 7);
    default:
      return [];
  }
}
