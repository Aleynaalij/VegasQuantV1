"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import TeamLogo from "./team-logo";
import PlayerPortrait from "./player-portrait";
import LegActions from "./leg-actions";
import GamblyLink from "./gambly-link";
import { useLegForms } from "./leg-form";
import {
  americanPrice,
  moneylineRead,
  propLine,
  type MoneylineRead,
} from "@/lib/home-props";
import {
  canBuildWith,
  parlayCopyLine,
  selectionError,
  type PublishedLeg,
} from "@/lib/parlay-builder";
type Leg = {
  leg_key: string;
  name: string;
  market: string;
  game_id: string;
  quote: string | null;
  expires_at: string;
  result: string | null;
  copy_text: string | null;
  gambly_url: string | null;
  why: string;
  risk: string;
};
export default function HomeGameList({ games }: { games: Game[] }) {
  const [opened, setOpened] = useState(false),
    [legs, setLegs] = useState<Leg[]>([]),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [draftNotice, setDraftNotice] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [copied, setCopied] = useState<Record<string, string>>({});
  // Same player + stat lines the Gambly copy uses, one per line, for the props on screen.
  async function copyAll(gameId: string, rows: Leg[]) {
    const text = rows
      .map(
        (r) =>
          parlayCopyLine(r as unknown as PublishedLeg) ||
          r.copy_text ||
          `${r.name} ${r.market}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied((c) => ({
        ...c,
        [gameId]: `Copied ${rows.length} leg${rows.length === 1 ? "" : "s"}.`,
      }));
    } catch {
      setCopied((c) => ({
        ...c,
        [gameId]: "Copy is unavailable in this browser.",
      }));
    }
  }
  const [statFilter, setStatFilter] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Record<string, MoneylineRead>>({});
  const { forms } = useLegForms(legs.map((l) => l.leg_key));
  async function toggleLeg(key: string) {
    const leg = legs.find((r) => r.leg_key === key);
    const game = games.find((g) => g.id === leg?.game_id);
    if (
      !leg ||
      !game ||
      Date.parse(leg.expires_at) <= Date.now() ||
      Date.parse(game.kickoff) <= Date.now()
    ) {
      setDraftNotice("This prop has closed. Refresh the game list.");
      return;
    }
    const session = await supabase.auth.getSession();
    const uid = session.data.session?.user.id;
    if (!uid) {
      setDraftNotice("Sign in to build your lay.");
      return;
    }
    try {
      const storageKey = `vq-parlay-draft:${uid}`;
      const raw = sessionStorage.getItem(storageKey);
      const draft = raw ? JSON.parse(raw) : { title: "My parlay", keys: [] };
      const keys: string[] = Array.isArray(draft.keys)
        ? draft.keys.filter((k: unknown) => typeof k === "string")
        : [];
      if (!keys.includes(key)) {
        // Same rules the lay builder applies when it restores this draft.
        const current = keys.flatMap((k) => {
          const row = legs.find((r) => r.leg_key === k);
          return row ? [row as unknown as PublishedLeg] : [];
        });
        const error = selectionError(current, leg as unknown as PublishedLeg);
        if (error) {
          setDraftNotice(error);
          return;
        }
      }
      const next = keys.includes(key)
        ? keys.filter((k) => k !== key)
        : [...keys, key];
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          title: typeof draft.title === "string" ? draft.title : "My parlay",
          keys: next,
        }),
      );
      setChosen(next);
      setDraftNotice("");
    } catch {
      setDraftNotice(
        "Draft storage is unavailable. Open the lay builder in The Zone.",
      );
    }
  }
  const slate = games
    .filter(
      (g) =>
        (!g.sport || g.sport === "nfl") &&
        Date.parse(g.kickoff) > Date.now() &&
        Date.parse(g.kickoff) < Date.now() + 7 * 86400000,
    )
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const ids = slate
    .map((g) => g.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!opened || !ids) return;
    let live = true;
    async function load() {
      setNotice("Loading props…");
      setChosen([]);
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session) {
          if (live) {
            setLegs([]);
            setNotice("Sign in to see game props.");
          }
          return;
        }
        try {
          const raw = sessionStorage.getItem(
            `vq-parlay-draft:${session.data.session.user.id}`,
          );
          const draft = raw ? JSON.parse(raw) : null;
          if (live && Array.isArray(draft?.keys))
            setChosen(draft.keys.filter((k: unknown) => typeof k === "string"));
        } catch {}
        const r = await supabase
          .from("published_legs")
          .select(
            "leg_key,name,market,game_id,quote,expires_at,result,copy_text,gambly_url,why,risk",
          )
          .in("game_id", ids.split(","))
          .gt("expires_at", new Date().toISOString())
          .is("result", null)
          .order("published_at", { ascending: false })
          .limit(1000);
        if (r.error) throw r.error;
        if (live) {
          setLegs(r.data || []);
          setNotice("");
        }
      } catch {
        if (live) setNotice("Props could not load. Please retry.");
      }
    }
    void load();
    const sub = supabase.auth.onAuthStateChange(() => {
      if (live) void load();
    });
    return () => {
      live = false;
      sub.data.subscription.unsubscribe();
    };
  }, [opened, ids, retry]);
  // Card faces carry the latest FanDuel moneyline and its no-vig split (members can read it).
  useEffect(() => {
    if (!ids) return;
    let live = true,
      generation = 0;
    async function load() {
      const n = ++generation;
      const session = await supabase.auth.getSession();
      if (!live || n !== generation) return;
      if (!session.data.session) {
        setLines({});
        return;
      }
      const r = await supabase
        .from("source_observations")
        .select("game_id,payload")
        .in("game_id", ids.split(","))
        .eq("kind", "odds")
        .eq("payload->>book", "FanDuel")
        .eq("payload->>market", "h2h")
        .order("recorded_at", { ascending: false })
        .limit(200);
      if (!live || n !== generation || r.error) return;
      const next: Record<string, MoneylineRead> = {};
      for (const row of r.data || []) {
        if (next[row.game_id]) continue;
        const game = slate.find((g) => g.id === row.game_id);
        const read = game
          ? moneylineRead(
              row.payload?.outcomes || [],
              game.home_team,
              game.away_team,
            )
          : null;
        if (read) next[row.game_id] = read;
      }
      setLines(next);
    }
    void load();
    // Prices move: refresh on the same one-minute cadence as the game page's snapshots, and
    // reload (or clear) when the account signs in or out.
    const timer = setInterval(load, 60000);
    const auth = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      live = false;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
    // slate is derived from ids; the effect keys on the id list only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return (
    <section
      id="home-games"
      className="vq-game-list"
      aria-label="This week's games"
    >
      {draftNotice ? <p role="status">{draftNotice}</p> : null}
      {chosen.length ? (
        <Link className="vq-btn" href="/parlays">
          Build your lay · {chosen.length} selected →
        </Link>
      ) : null}
      {!slate.length ? (
        <p>No upcoming games are available yet.</p>
      ) : (
        slate.map((g) => (
          <details
            key={g.id}
            className="vq-game-row"
            onToggle={(e) => {
              if (e.currentTarget.open) setOpened(true);
            }}
          >
            <summary>
              <span className="vq-game-head">
                <span className="vq-game-teams">
                  <TeamLogo team={g.away_team} size={26} />
                  <b>{g.away_team.split(" ").at(-1)}</b>
                  <small>@</small>
                  <TeamLogo team={g.home_team} size={26} />
                  <b>{g.home_team.split(" ").at(-1)}</b>
                </span>
                <span className="vq-game-when">
                  <span className="vq-game-time">
                    {kickoffText(g.kickoff)} ET
                  </span>
                  <ChevronDown
                    className="vq-expand-chevron"
                    size={20}
                    aria-hidden="true"
                  />
                </span>
              </span>
              {lines[g.id] ? (
                <MoneylineFace
                  read={lines[g.id]}
                  home={g.home_team}
                  away={g.away_team}
                />
              ) : null}
            </summary>
            <div className="vq-game-props">
              {notice ? (
                <p role="status">
                  {notice}
                  {notice.includes("retry") ? (
                    <button onClick={() => setRetry((n) => n + 1)}>
                      Retry
                    </button>
                  ) : null}
                </p>
              ) : null}
              {!notice && !legs.some((r) => r.game_id === g.id) ? (
                <p>No published props for this game yet.</p>
              ) : null}
              {(() => {
                const rows = legs.filter((r) => r.game_id === g.id);
                if (!rows.length) return null;
                const stats = [
                  ...new Set(
                    rows.flatMap((r) => propLine(r.market, r.name)?.stat || []),
                  ),
                ];
                const active = statFilter[g.id] || "All";
                const shown = rows.filter(
                  (r) =>
                    active === "All" ||
                    propLine(r.market, r.name)?.stat === active,
                );
                return (
                  <>
                    {stats.length > 1 ? (
                      <div
                        className="vq-prop-filters"
                        role="group"
                        aria-label="Filter by stat"
                      >
                        {["All", ...stats].map((stat) => (
                          <button
                            key={stat}
                            type="button"
                            aria-pressed={active === stat}
                            onClick={() => {
                              setStatFilter((f) => ({ ...f, [g.id]: stat }));
                              setCopied((c) => ({ ...c, [g.id]: "" }));
                            }}
                          >
                            {stat}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="vq-prop-copy">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void copyAll(g.id, shown)}
                      >
                        Copy all {shown.length} leg
                        {shown.length === 1 ? "" : "s"}
                      </button>
                      {copied[g.id] ? (
                        <span role="status">{copied[g.id]}</span>
                      ) : null}
                    </div>
                    <div className="vq-prop-table">
                      <div className="vq-prop-head" aria-hidden="true">
                        <span>Player</span>
                        <span>Form</span>
                        <span>Line</span>
                        <span>Stat</span>
                      </div>
                      {shown.map((r) => {
                        const line = propLine(r.market, r.name);
                        const form = forms[r.leg_key];
                        const open = openKey === r.leg_key;
                        const [first, ...rest] = r.name.trim().split(/\s+/);
                        return (
                          <article key={r.leg_key} className="vq-prop">
                            <button
                              type="button"
                              className="vq-prop-row"
                              aria-expanded={open}
                              aria-label={`${r.name}, ${line ? `${line.direction} ${line.line} ${line.stat}` : r.market}${form?.sample ? `, cleared ${form.cleared} of last ${form.sample}` : ", no recent form"}. Show details`}
                              onClick={() => setOpenKey(open ? "" : r.leg_key)}
                            >
                              <PlayerPortrait name={r.name} />
                              <span className="vq-prop-name">
                                <b>{rest.length ? rest.join(" ") : first}</b>
                                <small>
                                  {rest.length ? `${first[0]}. · ` : ""}
                                  {form?.position || "NFL"} ·{" "}
                                  {shortDate(g.kickoff)}
                                </small>
                              </span>
                              <FormGauge
                                cleared={form?.cleared}
                                sample={form?.sample}
                              />
                              <span className="vq-prop-line">
                                {line ? (
                                  <>
                                    <small>{line.direction}</small> {line.line}
                                  </>
                                ) : (
                                  "Target"
                                )}
                              </span>
                              <span className="vq-prop-stat">
                                {line?.stat || r.market}
                              </span>
                            </button>
                            {open ? (
                              <div className="vq-prop-detail">
                                <p>
                                  {r.name} · {r.market}
                                  <br />
                                  <small>
                                    {r.quote ||
                                      "Analyst target · price not verified"}
                                    {form
                                      ? ` · cleared ${form.cleared} of last ${form.sample}${form.median === null ? "" : `, median ${Math.round(form.median)}`}`
                                      : ""}
                                  </small>
                                </p>
                                {canBuildWith(r as unknown as PublishedLeg) ||
                                chosen.includes(r.leg_key) ? (
                                  <button
                                    type="button"
                                    className="secondary"
                                    aria-pressed={chosen.includes(r.leg_key)}
                                    onClick={() => void toggleLeg(r.leg_key)}
                                  >
                                    {chosen.includes(r.leg_key)
                                      ? "✓ Added to your lay"
                                      : "Add to your lay"}
                                  </button>
                                ) : null}
                                <LegActions
                                  legKey={r.leg_key}
                                  expired={
                                    Date.parse(r.expires_at) <= Date.now() ||
                                    Date.parse(g.kickoff) <= Date.now()
                                  }
                                />
                                {r.gambly_url &&
                                Date.parse(r.expires_at) > Date.now() ? (
                                  <GamblyLink
                                    url={r.gambly_url}
                                    selection={
                                      r.copy_text || `${r.name} ${r.market}`
                                    }
                                    kalshiLegKeys={[r.leg_key]}
                                  />
                                ) : null}
                                <details>
                                  <summary>Why this prop · risks</summary>
                                  <p>{r.why}</p>
                                  <p>{r.risk}</p>
                                </details>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                    <p className="vq-prop-note">
                      Form is how often the player cleared this line in recent
                      games, not a model probability. Tap a player for the case,
                      price and actions.
                    </p>
                  </>
                );
              })()}
            </div>
          </details>
        ))
      )}
    </section>
  );
}

const kickoffText = (kickoff: string) =>
  new Date(kickoff).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const shortDate = (kickoff: string) =>
  new Date(kickoff).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  });
const tone = (pct: number) => (pct >= 70 ? "good" : pct >= 50 ? "mid" : "low");

/** Half-ring gauge of a player's recent clear rate for this exact line. */
function FormGauge({ cleared, sample }: { cleared?: number; sample?: number }) {
  if (!sample)
    return (
      <span className="vq-gauge is-empty" aria-label="No recent form">
        <svg viewBox="0 0 64 36" aria-hidden="true">
          <path d="M6 32a26 26 0 0 1 52 0" />
        </svg>
        <b>–</b>
      </span>
    );
  const pct = Math.round(((cleared || 0) / sample) * 100);
  const length = Math.PI * 26;
  return (
    <span
      className={`vq-gauge is-${tone(pct)}`}
      aria-label={`Cleared ${cleared} of last ${sample}`}
    >
      <svg viewBox="0 0 64 36" aria-hidden="true">
        <path d="M6 32a26 26 0 0 1 52 0" />
        <path
          className="vq-gauge-fill"
          d="M6 32a26 26 0 0 1 52 0"
          strokeDasharray={`${(pct / 100) * length} ${length}`}
        />
      </svg>
      <b>{pct}%</b>
      <small>L{sample}</small>
    </span>
  );
}

/** Card-face moneyline: both prices and the market favorite's no-vig win chance. */
function MoneylineFace({
  read,
  home,
  away,
}: {
  read: MoneylineRead;
  home: string;
  away: string;
}) {
  const favorite =
    read.home.probability >= read.away.probability ? "home" : "away";
  const team = (favorite === "home" ? home : away).split(" ").at(-1);
  const pct = Math.round(read[favorite].probability * 100);
  return (
    <span className="vq-ml-face">
      <span className="vq-ml-chip">ML</span>
      <span className="vq-ml-prices">
        <span>
          {away.split(" ").at(-1)} {americanPrice(read.away.price)}
        </span>
        <span>
          {home.split(" ").at(-1)} {americanPrice(read.home.price)}
        </span>
      </span>
      <span
        className={`vq-ml-lean is-${tone(pct)}`}
        aria-label={`Market lean: ${team}, ${pct}% no-vig win chance at FanDuel`}
      >
        <small>Market lean</small>
        <b>
          {team} {pct}%
        </b>
      </span>
    </span>
  );
}
