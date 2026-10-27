"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Game } from "@/lib/domain";
import { supabase } from "@/lib/supabase";
import TeamLogo from "./team-logo";
import PlayerPortrait from "./player-portrait";
import LegActions from "./leg-actions";
import GamblyLink from "./gambly-link";
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
  return (
    <section
      id="home-games"
      className="vq-game-list"
      aria-label="This week's games"
    >
      {draftNotice ? <p role="status">{draftNotice}</p> : null}
      {chosen.length ? (
        <Link className="vq-btn" href="/community?build=1#zone-builder">
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
              <span className="vq-game-teams">
                <TeamLogo team={g.away_team} size={26} />
                <b>{g.away_team.split(" ").at(-1)}</b>
                <small>@</small>
                <TeamLogo team={g.home_team} size={26} />
                <b>{g.home_team.split(" ").at(-1)}</b>
              </span>
              <span className="vq-game-time">
                {new Date(g.kickoff).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET <span aria-hidden="true">⌄</span>
              </span>
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
              {legs
                .filter((r) => r.game_id === g.id)
                .map((r) => (
                  <article key={r.leg_key} className="vq-inline-prop">
                    <div className="vq-inline-prop-title">
                      <PlayerPortrait name={r.name} />
                      <div>
                        <h3>{r.name}</h3>
                        <p>{r.market}</p>
                        <small>
                          {r.quote || "Analyst target · price not verified"}
                        </small>
                      </div>
                    </div>
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
                    <LegActions
                      legKey={r.leg_key}
                      expired={
                        Date.parse(r.expires_at) <= Date.now() ||
                        Date.parse(g.kickoff) <= Date.now()
                      }
                    />
                    {r.gambly_url && Date.parse(r.expires_at) > Date.now() ? (
                      <GamblyLink
                        url={r.gambly_url}
                        selection={r.copy_text || `${r.name} ${r.market}`}
                        kalshiLegKeys={[r.leg_key]}
                      />
                    ) : null}
                    <details>
                      <summary>Why this prop · risks</summary>
                      <p>{r.why}</p>
                      <p>{r.risk}</p>
                    </details>
                  </article>
                ))}
            </div>
          </details>
        ))
      )}
    </section>
  );
}
