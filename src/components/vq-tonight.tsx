"use client";
import Link from "next/link";
import { ChevronRight, Layers, Search, Users } from "lucide-react";
import BrandMark from "./brand-mark";
import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { supabase } from "@/lib/supabase";
import { SPORTS, type Sport } from "@/lib/sports";
import type { Game } from "@/lib/domain";
import {
  fromDeskGames,
  fromNbaGames,
  fromSportsHome,
  startLabel,
  statusLabel,
  tonightGames,
  tonightWindow,
  type TonightGame,
} from "@/lib/vq-tonight";
import "@/app/vq-tonight.css";

/**
 * A sport's schedule as last read. `checkedAt` is when Vegas Quant last read it, not when the
 * provider last changed it; `stale` means a later refresh failed and these are the earlier games.
 */
type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ok"; games: TonightGame[]; checkedAt: number; stale: boolean };
const ORDER: Sport[] = ["nfl", "nba", "nhl", "ncaab"];
const SHOWN = 8;
/** Re-read schedules every 5 minutes while the page is visible: 3 small reads, no provider credits. */
const REFRESH = 5 * 60000;
const clock = (t: number) =>
  `${new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;

/**
 * Home's daily view: today's games (Eastern time) across sports with a route into each game's
 * existing page, the lay in progress and the Zone. Built only from readers Home already uses; it
 * does not rank games or claim research exists for a game.
 */
export default function VqTonight({ nflGames, presentation = "standard" }: { nflGames: Game[]; presentation?: "standard" | "skybox" }) {
  const skybox = presentation === "skybox";
  const previewLimit = skybox ? 3 : SHOWN;
  const [now, setNow] = useState(() => Date.now());
  const day = useMemo(() => tonightWindow(now), [now]);
  const [loads, setLoads] = useState<Record<Exclude<Sport, "nfl">, Load>>({
    nba: { state: "loading" }, nhl: { state: "loading" }, ncaab: { state: "loading" },
  });
  const [all, setAll] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(0);

  // Each sport's newest request wins: a late answer from an earlier request (or an earlier ET day)
  // is ignored, whether it succeeded or failed.
  const latest = useRef<Record<Exclude<Sport, "nfl">, number>>({ nba: 0, nhl: 0, ncaab: 0 });
  const dayStart = useRef(day.start);
  dayStart.current = day.start;
  const load = useCallback(async (sport: Exclude<Sport, "nfl">, w = day) => {
    const n = ++latest.current[sport];
    const current = () => n === latest.current[sport] && w.start === dayStart.current;
    // Keep showing what we have while refreshing; only a first load shows "loading".
    setLoads((l) => (l[sport].state === "ok" ? l : { ...l, [sport]: { state: "loading" } }));
    try {
      let games: TonightGame[];
      if (sport === "nba") {
        const r = await supabase
          .from("nba_games")
          .select("id,slug,away_team,home_team,tipoff,tipoff_tbd,status")
          .gte("tipoff", new Date(w.start).toISOString())
          .lt("tipoff", new Date(w.end).toISOString())
          .order("tipoff")
          .limit(100);
        if (r.error) throw r.error;
        games = fromNbaGames(r.data);
      } else {
        const r = await supabase.rpc("sports_home", { p_sport: sport, p_days: 1 });
        if (r.error) throw r.error;
        const parsed = fromSportsHome(sport, r.data);
        if (!parsed) throw Error("Unexpected schedule response");
        games = parsed;
      }
      if (!current()) return;
      setLoads((l) => ({ ...l, [sport]: { state: "ok", games, checkedAt: Date.now(), stale: false } }));
    } catch {
      if (!current()) return;
      // A failed refresh keeps the earlier games, marked stale; a failed first load is an error.
      setLoads((l) => {
        const prev = l[sport];
        return { ...l, [sport]: prev.state === "ok" ? { ...prev, stale: true } : { state: "error" } };
      });
    }
  }, [day]);

  useEffect(() => {
    // A new ET day starts clean: the previous day's games are never shown as today's.
    setLoads({ nba: { state: "loading" }, nhl: { state: "loading" }, ncaab: { state: "loading" } });
    const all = () => (["nba", "nhl", "ncaab"] as const).forEach((s) => void load(s));
    all();
    // Same-day status changes (final, postponed) appear without a reload.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") all();
    }, REFRESH);
    return () => clearInterval(timer);
  }, [load]);

  // Roll over at ET midnight, and catch up when the tab wakes.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible" && Date.now() >= day.end) setNow(Date.now());
    };
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1000, day.end - Date.now() + 1000));
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [day.end]);

  // Signed-in state and the lay in progress (this account's draft only).
  useEffect(() => {
    let live = true;
    let reads = 0;
    const read = async () => {
      const n = ++reads;
      const s = await supabase.auth.getSession();
      if (!live || n !== reads) return; // a newer read (e.g. after an account change) won
      const uid = s.data.session?.user.id;
      setSignedIn(Boolean(uid));
      try {
        const d = uid ? JSON.parse(sessionStorage.getItem(`vq-parlay-draft:${uid}`) || "null") : null;
        setDraft(Array.isArray(d?.keys) ? d.keys.length : 0);
      } catch {
        setDraft(0);
      }
    };
    void read();
    const sub = supabase.auth.onAuthStateChange(() => void read());
    // Selections added or removed on Home in this visit, or in another tab.
    const changed = () => void read();
    window.addEventListener("vq-parlay-draft-changed", changed);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", changed);
    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
      window.removeEventListener("vq-parlay-draft-changed", changed);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", changed);
    };
  }, []);

  const rows = useMemo(() => {
    const loaded = (["nba", "nhl", "ncaab"] as const).flatMap((s) => {
      const l = loads[s];
      return l.state === "ok" ? l.games : [];
    });
    return tonightGames([...fromDeskGames(nflGames), ...loaded], now);
  }, [loads, nflGames, now]);
  const failed = (["nba", "nhl", "ncaab"] as const).filter((s) => loads[s].state === "error");
  const stale = (["nba", "nhl", "ncaab"] as const).filter((s) => {
    const l = loads[s];
    return l.state === "ok" && l.stale;
  });
  const checked = (["nba", "nhl", "ncaab"] as const).flatMap((s) => {
    const l = loads[s];
    return l.state === "ok" ? [l.checkedAt] : [];
  });
  const lastChecked = checked.length ? Math.min(...checked) : null;
  const loading = (["nba", "nhl", "ncaab"] as const).some((s) => loads[s].state === "loading");
  const shown = all ? rows : rows.slice(0, previewLimit);
  // The skybox is a single chronological board. Standard desks keep sport grouping.
  const groups = skybox
    ? [["all", shown] as const]
    : ORDER.map((s) => [s, shown.filter((g) => g.sport === s)] as const).filter(([, g]) => g.length);

  return (
    <section
      id="vq-tonight"
      className={`vq-tonight${skybox ? " vq-tonight-skybox" : ""}`}
      aria-labelledby="vq-tonight-title"
    >
      <div
        className="vq-tonight-board"
        style={skybox ? undefined : { display: "contents" }}
      >
        {skybox ? <SkyboxEnclosure /> : null}
        <header className="vq-tonight-head">
          <h2 id="vq-tonight-title" aria-label="VQ Tonight">
            {skybox ? (
              <>
                <BrandMark />
                <span className="vq-tonight-brand-text">VQ </span>Tonight
              </>
            ) : (
              "VQ Tonight"
            )}
          </h2>
          <p>Today · {day.label} · Eastern time</p>
          {lastChecked && !skybox ? (
            <p className="vq-tonight-checked">
              Schedules checked {clock(lastChecked)}. Times and statuses are as
              the league data reported them then.
            </p>
          ) : null}
        </header>

        {stale.length ? (
          <p className="vq-tonight-alert" role="alert">
            Couldn’t refresh {stale.map((s) => SPORTS[s].label).join(", ")}:
            showing games as last checked, which may be out of date.{" "}
            <button
              type="button"
              onClick={() => stale.forEach((s) => void load(s))}
            >
              Retry
            </button>
          </p>
        ) : null}

        {failed.length ? (
          <p className="vq-tonight-alert" role="alert">
            {failed.map((s) => SPORTS[s].label).join(", ")} games could not
            load.{" "}
            <button
              type="button"
              onClick={() => failed.forEach((s) => void load(s))}
            >
              Retry
            </button>
          </p>
        ) : null}

        {!rows.length ? (
          <p className="vq-tonight-empty" role="status">
            {loading
              ? "Loading today’s games…"
              : failed.length
                ? "No other games to show right now."
                : "No games are scheduled today."}
          </p>
        ) : (
          <div className="vq-tonight-games">
            {groups.map(([sport, games]) => (
              <div key={sport} className="vq-tonight-sport">
                {sport !== "all" ? <h3>{SPORTS[sport].label}</h3> : null}
                <ul>
                  {games.map((g) => {
                    const status = statusLabel(g.status);
                    return (
                      <li key={`${g.sport}:${g.id}`}>
                        <Link
                          href={g.href}
                          className="vq-tonight-game"
                          aria-label={`${g.away} at ${g.home}, ${status ?? startLabel(g)}. Open the game page`}
                        >
                          {skybox ? (
                            <span className="vq-tonight-sport-badge">
                              {SPORTS[g.sport].label}
                            </span>
                          ) : null}
                          <span className="vq-tonight-teams">
                            {g.away} <small>@</small> {g.home}
                          </span>
                          <span className="vq-tonight-when">
                            {status ? <b>{status}</b> : skybox ? <><span className="vq-tonight-day">Today</span><span>{startLabel(g)}</span></> : startLabel(g)}
                          </span>
                          <span className="vq-tonight-go" aria-hidden="true">
                            Game page →
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {rows.length > previewLimit ? (
              <button
                type="button"
                className="vq-tonight-more"
                aria-expanded={all}
                onClick={() => setAll((v) => !v)}
              >
                {all ? "Show fewer games" : `Show all ${rows.length} games`}
                {skybox ? <ChevronRight size={16} aria-hidden="true" /> : null}
              </button>
            ) : null}
            {loading ? (
              <p className="vq-tonight-note" role="status">
                Still loading some sports…
              </p>
            ) : null}
          </div>
        )}
        {skybox && lastChecked ? <p className="vq-tonight-checked vq-tonight-screen-note">Schedules checked {clock(lastChecked)}. Times and statuses are as the league data reported them then.</p> : null}
      </div>
      {skybox ? (
        <h3 className="vq-lobby-section-title">Your next move</h3>
      ) : null}
      <div className="vq-tonight-next">
        {skybox ? (
          <Link href="/feed?view=latest" className="vq-tonight-card">
            <Search aria-hidden="true" />
            <b>Research</b>
            <small>Published research, reasons and risks.</small>
          </Link>
        ) : null}
        <Link href="/parlays" className="vq-tonight-card">
          {skybox ? <Layers aria-hidden="true" /> : null}
          <b>{draft ? `Continue your lay · ${draft} selected` : "My lays"}</b>
          <small>
            {draft
              ? "Pick up where you left off."
              : "Your saved lays and the leg library."}
          </small>
        </Link>
        {signedIn === false ? (
          <Link href="/membership" className="vq-tonight-card">
            {skybox ? <Users aria-hidden="true" /> : null}
            <b>The Zone · sign in</b>
            <small>Member discussion is for signed-in members.</small>
          </Link>
        ) : (
          <Link href="/community" className="vq-tonight-card">
            {skybox ? <Users aria-hidden="true" /> : null}
            <b>The Zone</b>
            <small>Member talk, kept separate from published research.</small>
          </Link>
        )}
      </div>
    </section>
  );
}

/** Decorative hanging enclosure. The readable schedule and every control stay in HTML above it. */
function SkyboxEnclosure() {
  const id = `skybox-${useId().replace(/:/g, "")}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  return (
    <div className="vq-jumbotron-casing" aria-hidden="true">
      <svg className="vq-jumbotron-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="#fff4bc" />
            <stop offset=".12" stopColor="#e7b863" />
            <stop offset=".3" stopColor="#8a511a" />
            <stop offset=".47" stopColor="#f2c46e" />
            <stop offset=".61" stopColor="#fff0af" />
            <stop offset=".75" stopColor="#bc7f29" />
            <stop offset="1" stopColor="#61370f" />
          </linearGradient>
          <linearGradient id={`${id}-rail`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3c210c" />
            <stop offset=".16" stopColor="#ba7a2b" />
            <stop offset=".35" stopColor="#fff3bf" />
            <stop offset=".48" stopColor="#f7cd79" />
            <stop offset=".62" stopColor="#8e521a" />
            <stop offset=".87" stopColor="#d69c42" />
            <stop offset="1" stopColor="#38230d" />
          </linearGradient>
          <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#111b15" />
            <stop offset=".44" stopColor="#040807" />
            <stop offset="1" stopColor="#0a100d" />
          </linearGradient>
          <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#07131b" />
            <stop offset=".38" stopColor="#163943" />
            <stop offset=".75" stopColor="#0b1d22" />
            <stop offset="1" stopColor="#010504" />
          </linearGradient>
          <linearGradient id={`${id}-underside`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#252415" />
            <stop offset=".5" stopColor="#090d0a" />
            <stop offset="1" stopColor="#030504" />
          </linearGradient>
          <linearGradient id={`${id}-emerald`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#052719" />
            <stop offset=".45" stopColor="#0ca267" />
            <stop offset=".6" stopColor="#48d58a" />
            <stop offset="1" stopColor="#05271c" />
          </linearGradient>
          <radialGradient id={`${id}-glint`}>
            <stop offset="0" stopColor="#fffbe4" />
            <stop offset=".25" stopColor="#ffe6a3" stopOpacity=".85" />
            <stop offset="1" stopColor="#edab40" stopOpacity="0" />
          </radialGradient>
          <pattern
            id={`${id}-led`}
            width="12"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="4" r="1.3" fill="#81c9c6" opacity=".4" />
          </pattern>
          <filter
            id={`${id}-lamp-glow`}
            x="-100%"
            y="-150%"
            width="300%"
            height="400%"
          >
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
      </svg>
      <svg
        className="vq-jumbotron-body"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        focusable="false"
      >
        {/* Receding side screens have abstract light only, never fabricated scores or text. */}
        <path
          data-skybox-plane="left"
          d="M124 0 27 116 13 887 53 1000Z"
          fill={paint("side")}
          stroke="#876230"
          strokeWidth="2"
        />
        <path
          data-skybox-plane="right"
          d="M876 0 973 116 987 887 947 1000Z"
          fill={paint("side")}
          stroke="#876230"
          strokeWidth="2"
        />
        <path
          d="M101 102 35 190 25 850 69 905Z M899 102 965 190 975 850 931 905Z"
          fill={paint("led")}
        />
        <path
          d="m36 263 61-83-2 35-60 86z m-3 111 56-70-3 33-54 72z m-3 111 51-61-3 34-49 59z m-2 112 45-52-3 32-43 50z m-2 111 40-43-2 31-39 45z"
          fill="#88aebe"
          opacity=".24"
        />
        <path
          d="m964 263-61-83 2 35 60 86z m3 111-56-70 3 33 54 72z m3 111-51-61 3 34 49 59z m2 112-45-52 3 32 43 50z m2 111-40-43 2 31 39 45z"
          fill="#6ca3ad"
          opacity=".2"
        />
        <path
          d="M27 116 38 130 24 875 13 887Z M973 116 962 130 976 875 987 887Z"
          fill="#1b180f"
          stroke="#c38f3f"
          strokeWidth="2"
        />
        <path
          data-skybox-plane="front"
          d="M124 0H876L947 1000H53Z"
          fill={paint("screen")}
        />
        {/* Four faces on each gold upright create a bevel instead of a flat outline. */}
        <path
          d="M112 0H137L72 1000H47Z M863 0H888L953 1000H928Z"
          fill={paint("rail")}
        />
        <path
          d="M126 0 60 1000 M874 0 940 1000"
          stroke="#fff0bd"
          strokeWidth="3"
          opacity=".9"
        />
        <path
          d="M137 0 72 1000 M863 0 928 1000"
          stroke="#4b2b10"
          strokeWidth="4"
        />
        <path
          d="M141 0 77 1000 M859 0 923 1000"
          stroke="#b9934f"
          strokeWidth="1"
          opacity=".5"
        />
      </svg>
      <svg
        className="vq-jumbotron-top"
        viewBox="0 0 1000 118"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M119 8Q500-1 881 8L956 61Q988 87 975 117L875 55H125L25 117Q12 87 44 61Z"
          fill="#151a12"
          stroke="#8f632d"
          strokeWidth="2"
        />
        <path
          d="M116 32 49 80Q29 96 37 113L114 68Z M884 32 951 80Q971 96 963 113L886 68Z"
          fill={paint("emerald")}
        />
        <path
          d="M119 8Q500-1 881 8L892 31Q500 21 108 31Z"
          fill={paint("gold")}
        />
        <path
          d="M119 8 44 61Q12 87 25 117L35 98Q37 85 52 74L108 31Z M881 8 956 61Q988 87 975 117L965 98Q963 85 948 74L892 31Z"
          fill={paint("gold")}
        />
        <path
          d="M119 8Q500-1 881 8 M108 31Q500 21 892 31"
          fill="none"
          stroke="#fff2ba"
          strokeWidth="2.5"
        />
        <path
          d="M44 61 119 8 108 31 52 74 M956 61 881 8 892 31 948 74"
          fill="none"
          stroke="#f5c773"
          strokeWidth="2"
        />
        <path
          d="M108 32Q500 22 892 32"
          fill="none"
          stroke="#472c12"
          strokeWidth="5"
        />
        <ellipse cx="330" cy="17" rx="105" ry="10" fill={paint("glint")} />
        <ellipse cx="765" cy="20" rx="75" ry="10" fill={paint("glint")} />
      </svg>
      <svg
        className="vq-jumbotron-underside"
        viewBox="0 0 1000 110"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M27 3Q500 35 973 3L871 97Q500 117 129 97Z"
          fill={paint("underside")}
          stroke="#65451e"
          strokeWidth="3"
        />
        {[150, 260, 380, 500, 620, 740, 850].map((x) => (
          <path
            key={x}
            d={`M${x} 15 ${500 + (x - 500) * 0.78} 100`}
            stroke="#4e3b1d"
            strokeWidth="5"
            opacity=".7"
          />
        ))}
        {[155, 325, 500, 675, 845].map((x) => (
          <g
            key={x}
            data-skybox-lights="cluster"
            transform={`translate(${x} ${x === 500 ? 70 : 57}) skewX(${(500 - x) / 18})`}
          >
            <ellipse
              rx="43"
              ry="20"
              fill="#ffba43"
              opacity=".8"
              filter={paint("lamp-glow")}
            />
            {[-12, 0, 12].flatMap((cx) =>
              [-6, 5].map((cy) => (
                <rect
                  key={`${cx}-${cy}`}
                  x={cx - 4}
                  y={cy - 2.5}
                  width="8"
                  height="5"
                  rx="1.5"
                  fill="#fff7ce"
                />
              )),
            )}
          </g>
        ))}
      </svg>
      <svg
        className="vq-jumbotron-bottom"
        viewBox="0 0 1000 75"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M53 4Q500 28 947 4L973 29Q500 63 27 29Z"
          fill={paint("gold")}
        />
        <path
          d="M27 29Q500 63 973 29L958 48Q500 82 42 48Z"
          fill={paint("rail")}
        />
        <path
          d="M53 4 27 29 42 48 68 28Z M947 4 973 29 958 48 932 28Z"
          fill={paint("gold")}
          stroke="#fce3a3"
          strokeWidth="2"
        />
        <path
          d="M53 4Q500 28 947 4 M27 29Q500 63 973 29"
          fill="none"
          stroke="#fff0bd"
          strokeWidth="2.5"
        />
        <path
          d="M42 48Q500 82 958 48"
          fill="none"
          stroke="#80511d"
          strokeWidth="3"
        />
        <ellipse cx="275" cy="35" rx="95" ry="15" fill={paint("glint")} />
        <ellipse cx="730" cy="37" rx="95" ry="15" fill={paint("glint")} />
      </svg>
    </div>
  );
}
