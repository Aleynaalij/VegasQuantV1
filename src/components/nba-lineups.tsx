"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  NBA_LINEUP_SOURCE,
  lineupForGame,
  lineupOuts,
  type LineupReport,
  type LineupGameIdentity,
  type TeamLineup,
} from "@/lib/nba-lineups";
import "@/app/nba-lineups.css";
const player = z
  .object({
    id: z.string().regex(/^\d+$/),
    name: z.string().min(1).max(100),
    position: z.string().min(1).max(4),
    status: z.string().max(40).nullable(),
  })
  .strict();
const team = z
  .object({
    team: z.string().regex(/^[A-Z]{2,3}$/),
    status: z.enum(["confirmed", "expected", "unavailable"]),
    starters: z.array(player).max(5),
    availability: z.array(player).max(40),
  })
  .strict();
const payload = z
  .object({
    version: z.literal(1),
    source: z.literal(NBA_LINEUP_SOURCE),
    checked_at: z.string().datetime({ offset: true }),
    server_now: z.string().datetime({ offset: true }),
    games: z
      .array(
        z
          .object({
            day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            time: z.string().regex(/^\d{2}:\d{2}$/),
            away: team,
            home: team,
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
type State = {
  report: LineupReport | null;
  now: number;
  message: string;
  loading: boolean;
  refresh: () => void;
};
const Context = createContext<State | null>(null);
/** One protected request for the NBA page, shared by its rows. No new provider credits or database writes. */
export function NbaLineupsProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<LineupReport | null>(null),
    [message, setMessage] = useState("Checking starting lineups…"),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(NaN);
  const sequence = useRef(0),
    anchor = useRef<{ epoch: number; mono: number } | null>(null),
    active = useRef(true);
  const clear = useCallback(() => {
    sequence.current++;
    anchor.current = null;
    setReport(null);
    setNow(NaN);
  }, []);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      if (!active.current || request !== sequence.current) return;
      if (!session.data.session) {
        clear();
        setMessage("Sign in with research access to view lineups.");
        setLoading(false);
        return;
      }
      const sent = performance.now();
      const response = await fetch("/api/nba/lineups", {
        headers: {
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.json();
      if (!active.current || request !== sequence.current) return;
      if (!response.ok)
        throw Error(
          response.status === 401 || response.status === 403
            ? "Sign in with research access to view lineups."
            : "Lineup check unavailable. Verify availability at the source.",
        );
      const parsed = payload.safeParse(raw);
      if (!parsed.success)
        throw Error(
          "Lineup response unavailable. Verify availability at the source.",
        );
      const received = performance.now(),
        rtt = received - sent;
      if (rtt < 0 || rtt > 15000) throw Error("Lineup check timed out. Retry.");
      const epoch = Date.parse(parsed.data.server_now) + rtt;
      anchor.current = { epoch, mono: received };
      setNow(epoch);
      setReport(parsed.data);
      setMessage("");
    } catch (error) {
      if (active.current && request === sequence.current) {
        anchor.current = null;
        setReport(null);
        setNow(NaN);
        setMessage(
          error instanceof Error ? error.message : "Lineup check unavailable.",
        );
      }
    } finally {
      if (active.current && request === sequence.current) setLoading(false);
    }
  }, [clear]);
  useEffect(() => {
    active.current = true;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    const tick = setInterval(() => {
      if (anchor.current)
        setNow(
          anchor.current.epoch +
            Math.max(0, performance.now() - anchor.current.mono),
        );
    }, 1000);
    const resume = () => {
      clear();
      if (document.visibilityState === "visible") void load();
    };
    const stop = onUserChange(() => {
      clear();
      void load();
    });
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active.current = false;
      sequence.current++;
      clearInterval(timer);
      clearInterval(tick);
      stop();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [load, clear]);
  return (
    <Context.Provider
      value={{ report, now, message, loading, refresh: () => void load() }}
    >
      {children}
    </Context.Provider>
  );
}
export function NbaAvailabilitySummary({ game }: { game: LineupGameIdentity }) {
  const state = useContext(Context);
  if (!state) return null;
  const g = lineupForGame(state.report, game, state.now);
  if (!g)
    return (
      <span className="nba-availability-note">
        {state.message || "Current lineup report unavailable for this game."}
      </span>
    );
  const outs = lineupOuts(g),
    confirmed = [g.away, g.home].filter((t) => t.status === "confirmed").length;
  return (
    <span
      className={outs.length ? "nba-availability-out" : "nba-availability-note"}
    >
      {outs.length
        ? `Out: ${outs.join(" · ")}`
        : [g.away, g.home].some((t) => t.status === "unavailable")
          ? "Availability report incomplete"
          : "No players listed Out in this report"}
      <small>
        {confirmed === 2
          ? "Both starting lineups confirmed"
          : confirmed === 1
            ? "One starting lineup confirmed"
            : "Starters not yet confirmed"}
      </small>
    </span>
  );
}
function Team({ lineup }: { lineup: TeamLineup }) {
  const confirmed =
    lineup.status === "confirmed" && lineup.starters.length === 5;
  return (
    <section
      className="nba-lineup-team"
      aria-label={`${lineup.team} starting lineup`}
    >
      <h4>
        {lineup.team}{" "}
        <span className={confirmed ? "nba-lineup-confirmed" : ""}>
          {confirmed
            ? "Confirmed starters"
            : lineup.status === "expected"
              ? "Awaiting confirmed starters"
              : "Lineup unavailable"}
        </span>
      </h4>
      {confirmed ? (
        <ol>
          {lineup.starters.map((p) => (
            <li key={p.id}>
              <small>{p.position}</small> {p.name}
              {p.status ? ` · ${p.status}` : ""}
            </li>
          ))}
        </ol>
      ) : (
        <p>Expected names are not treated as confirmed starters.</p>
      )}
      <h5>Player availability</h5>
      {lineup.availability.length ? (
        <ul>
          {lineup.availability.map((p) => (
            <li
              key={p.id}
              className={
                p.status?.startsWith("Out") ? "nba-availability-out" : ""
              }
            >
              <b>{p.name}</b> · {p.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {lineup.status === "unavailable"
            ? "Availability report incomplete."
            : "No availability flags in this report; this is not confirmation everyone will play."}
        </p>
      )}
    </section>
  );
}
export default function NbaLineups({ game }: { game: LineupGameIdentity }) {
  const state = useContext(Context);
  if (!state) return null;
  const g = lineupForGame(state.report, game, state.now);
  return (
    <section
      className="nba-lineups"
      aria-label="Starting lineups and availability"
    >
      <header>
        <h3>Starting lineups & availability</h3>
        <button type="button" onClick={state.refresh} disabled={state.loading}>
          {state.loading ? "Checking…" : "Refresh lineups"}
        </button>
      </header>
      {!g ? (
        <p role="status">
          {state.message ||
            "No current lineup report matches this game. Do not assume any player is available."}
        </p>
      ) : (
        <>
          <div className="nba-lineup-grid">
            <Team lineup={g.away} />
            <Team lineup={g.home} />
          </div>
          <p className="nba-lineup-stamp">
            Source checked{" "}
            {new Intl.DateTimeFormat("en-US", {
              timeZone: "America/New_York",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date(state.report!.checked_at))}{" "}
            ET · refreshes every minute while open.
          </p>
        </>
      )}
      <a href={NBA_LINEUP_SOURCE} target="_blank" rel="noopener noreferrer">
        RotoWire NBA lineups ↗
      </a>
      <p className="nba-lineup-note">
        Provider-reported status can change before tip-off. These are
        availability facts, not picks.
      </p>
    </section>
  );
}
