"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  liveStrip,
  sameGame,
  sportGameHref,
  type LiveGame,
  type LiveSport,
} from "@/lib/live-scores";
import {
  sweat,
  type LiveBox,
  type Sweat,
  type SweatPick,
} from "@/lib/live-sweat";

export type OurGame = {
  away: string;
  home: string;
  start: string;
  href?: string | null;
};

type Ours = {
  picks: Map<string, SweatPick[]>;
  hrefs: Map<string, string>;
};
const NONE: Ours = { picks: new Map(), hrefs: new Map() };
type NbaPick = SweatPick & { supersedes_id?: string | null };
/** sports_markets keeps a quote's fields in its `payload` JSON, not as columns. */
type SportPick = {
  id: string;
  market?: {
    payload?: {
      market?: SweatPick["market"];
      side?: SweatPick["side"];
      direction?: SweatPick["direction"];
      line?: number | null;
      player?: string | null;
    } | null;
  } | null;
};

/**
 * Our record of the games on the strip, by ESPN id (the provider id NBA, NHL and college games are
 * stored under): the picks published on each, and the NBA matchup link. Home only loads upcoming
 * games and unexpired picks, and picks expire at the start, so live games are looked up here. Picks
 * are member reads: others simply see none.
 */
async function lookup(sport: LiveSport, ids: string[]): Promise<Ours> {
  if (sport === "nfl" || !ids.length) return NONE;
  const out: Ours = { picks: new Map(), hrefs: new Map() };
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const r =
      sport === "nba"
        ? await supabase
            .from("nba_games")
            .select(
              "provider_id,slug,picks:nba_editorial_picks(id,player,market,direction,line,supersedes_id)",
            )
            .in("provider_id", part)
        : await supabase
            .from("sports_games")
            .select(
              "provider_id,picks:sports_selections(id,market:sports_markets(payload))",
            )
            .eq("sport", sport)
            .in("provider_id", part);
    if (r.error) return out;
    for (const row of (r.data || []) as {
      provider_id: string;
      slug?: string | null;
      picks?: (NbaPick | SportPick)[] | null;
    }[]) {
      const raw = row.picks || [];
      // NBA revisions replace the pick they supersede: only the latest counts.
      const replaced = new Set(
        raw.map((p) => (p as NbaPick).supersedes_id).filter(Boolean),
      );
      const picks: SweatPick[] =
        sport === "nba"
          ? (raw as NbaPick[])
              .filter((p) => !replaced.has(p.id))
              .map((p) => ({
                id: p.id,
                market: p.market,
                direction: p.direction,
                line: p.line,
                player: p.player,
              }))
          : (raw as SportPick[]).flatMap((p) => {
              const q = p.market?.payload;
              return q?.market
                ? [
                    {
                      id: p.id,
                      market: q.market,
                      side: q.side ?? null,
                      direction: q.direction ?? null,
                      line: typeof q.line === "number" ? q.line : null,
                      player: q.player ?? null,
                    },
                  ]
                : [];
            });
      if (picks.length) out.picks.set(row.provider_id, picks);
      if (row.slug)
        out.hrefs.set(
          row.provider_id,
          `/nba/games/${encodeURIComponent(row.slug)}`,
        );
    }
  }
  return out;
}

/**
 * Live game day: games in progress with score, period and clock, then today's finals. Refreshes
 * every 30 seconds while the tab is visible. Shows nothing when no game is live or recently final.
 */
export default function LiveNow({
  sport,
  ours = [],
}: {
  sport: LiveSport;
  /** NFL's slate, to link a live game to its matchup. */
  ours?: OurGame[];
}) {
  const [games, setGames] = useState<LiveGame[]>([]),
    [stale, setStale] = useState(false),
    [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const r = await fetch(`/api/live?sport=${sport}`);
        const d = await r.json();
        if (!live) return;
        if (!r.ok || !Array.isArray(d.games)) throw Error();
        setGames(d.games);
        setStale(false);
      } catch {
        if (live) setStale(true);
      }
      if (live) setClock(Date.now());
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [sport]);
  const [known, setKnown] = useState<Ours>(NONE);
  const shown = games
    .filter((g) => g.state !== "pre")
    .map((g) => g.id)
    .sort()
    .join(",");
  useEffect(() => {
    let live = true;
    void lookup(sport, shown ? shown.split(",") : []).then((o) => {
      if (live) setKnown(o);
    });
    return () => {
      live = false;
    };
  }, [sport, shown]);
  const isPicked = (g: LiveGame) => known.picks.has(g.id);
  const { live, finals, more } = liveStrip(games, clock, 12, isPicked);
  // Player props need the live box score: read it for the picked NBA/NHL games the strip shows,
  // live games first, on the same 30-second rhythm as the scores.
  const boxIds =
    sport === "nba" || sport === "nhl"
      ? [...new Set([...live, ...finals].map((g) => g.id))]
          .filter((id) =>
            known.picks.get(id)?.some((p) => p.market.startsWith("player_")),
          )
          .slice(0, 6)
          .join(",")
      : "";
  // A box score counts only while fresh: a failed refresh drops it ("live stats loading"), and a
  // final game uses only a box ESPN itself marks final, so an old count is never shown as a result.
  const [boxes, setBoxes] = useState<
    Record<string, { players: LiveBox; final: boolean }>
  >({});
  useEffect(() => {
    if (!boxIds) return;
    let live = true;
    void Promise.all(
      boxIds.split(",").map(async (id) => {
        try {
          const r = await fetch(`/api/live/box?sport=${sport}&id=${id}`);
          const d = await r.json();
          return r.ok && d.players
            ? ([
                id,
                { players: d.players as LiveBox, final: d.final === true },
              ] as const)
            : ([id, null] as const);
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((rows) => {
      if (!live) return;
      setBoxes((b) => {
        const next = { ...b };
        for (const [id, box] of rows) {
          if (box) next[id] = box;
          else delete next[id];
        }
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [sport, boxIds, clock]);
  const boxFor = (g: LiveGame) => {
    const b = boxes[g.id];
    return b && (g.state !== "post" || b.final) ? b.players : null;
  };
  const sweats = (g: LiveGame) =>
    (known.picks.get(g.id) || []).map((p) => ({
      id: p.id,
      s: sweat(p, g, boxFor(g), {
        away: g.away.abbreviation,
        home: g.home.abbreviation,
      }),
    }));
  if (!live.length && !finals.length) return null;
  const href = (g: LiveGame) =>
    sport === "nhl" || sport === "ncaab"
      ? sportGameHref(sport, g)
      : sport === "nba"
        ? known.hrefs.get(g.id) || null
        : ours.find((o) => sameGame(g, o))?.href || null;
  const card = (g: LiveGame) => {
    const to = href(g);
    const lead =
      g.away.score !== null && g.home.score !== null
        ? g.away.score > g.home.score
          ? "away"
          : g.home.score > g.away.score
            ? "home"
            : null
        : null;
    const body = (
      <>
        <span className="live-now-status">
          {g.state === "in" ? <b className="live-now-dot">LIVE</b> : null}
          {g.detail || (g.state === "post" ? "Final" : "")}
        </span>
        {(["away", "home"] as const).map((side) => (
          <span
            key={side}
            className={`live-now-team${lead === side ? " is-leading" : ""}`}
          >
            <span>{g[side].abbreviation}</span>
            <strong>{g[side].score ?? "–"}</strong>
          </span>
        ))}
        {isPicked(g) ? <PickLines lines={sweats(g)} /> : null}
      </>
    );
    return (
      <li
        key={g.id}
        className={`live-now-game is-${g.state}${isPicked(g) ? " is-picked" : ""}`}
      >
        {to ? (
          <Link
            href={to}
            aria-label={`${g.away.name} ${g.away.score ?? ""}, ${g.home.name} ${g.home.score ?? ""}, ${g.detail}. Open the matchup`}
          >
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        )}
      </li>
    );
  };
  return (
    <section className="live-now" aria-label="Live scores">
      <h2 className="live-now-title">
        {live.length ? "Live now" : "Today’s finals"}
      </h2>
      <ul className="live-now-list">
        {live.map(card)}
        {finals.map(card)}
      </ul>
      <p className="live-now-note">
        {more ? `${more} more games live. ` : ""}
        ESPN scores, refreshed every 30 seconds
        {stale ? "; the last refresh failed, so scores may be behind" : ""}.
      </p>
    </section>
  );
}

const MARK: Record<Sweat["state"], string> = {
  ahead: "On track",
  behind: "Needs more",
  even: "Level",
  hit: "Hit",
  miss: "Missed",
};

/** Where each of our picks on this game stands right now; a pick that can't be read yet says so. */
function PickLines({ lines }: { lines: { id: string; s: Sweat | null }[] }) {
  const shown = lines.slice(0, 3);
  return (
    <ul className="live-now-picks" aria-label="Our picks on this game">
      {shown.map(({ id, s }) =>
        s ? (
          <li key={id} className={`is-${s.state}`}>
            <b>{s.label}</b>
            <span>
              {s.detail} · {MARK[s.state]}
            </span>
          </li>
        ) : (
          <li key={id} className="is-pending">
            <b>Our pick</b>
            <span>live stats loading</span>
          </li>
        ),
      )}
      {lines.length > shown.length ? (
        <li className="is-more">+{lines.length - shown.length} more</li>
      ) : null}
    </ul>
  );
}
