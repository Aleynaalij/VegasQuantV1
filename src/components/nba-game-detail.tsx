"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { nbaHasScore, nbaPhase, type NbaGame } from "@/lib/nba-board";
import { nbaIsLive, nbaNickname } from "@/lib/nba-home";
import NbaTeamLogo from "./nba-team-logo";
import { NbaGameDetails } from "./nba-game-board";
import { Shell } from "./ui";
import "@/app/nba-game-detail.css";
export default function NbaGameDetail({ slug }: { slug: string }) {
  const [game, setGame] = useState<NbaGame | null>(null),
    [allowed, setAllowed] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true,
      busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const [g, a] = await Promise.all([
          supabase
            .from("nba_games")
            .select(
              "id,provider_id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season,season_type,status,away_score,home_score,source,updated_at",
            )
            .eq("slug", slug)
            .maybeSingle(),
          supabase.rpc("membership_status"),
        ]);
        if (!live) return;
        if (g.error) throw g.error;
        setGame(g.data);
        setAllowed(!a.error && a.data?.allowed === true);
        setNow(Date.now());
        setError(
          a.error
            ? "Member access could not be checked. Retry to load sportsbook details."
            : "",
        );
      } catch {
        if (live) {
          setAllowed(false);
          setError(
            "This matchup could not refresh. Any retained schedule may be older.",
          );
        }
      } finally {
        busy = false;
        if (live) setLoading(false);
      }
    }
    void load();
    const stop = onUserChange(() => {
      live = false;
      setAllowed(false);
      setGame(null);
      setLoading(true);
      setEpoch((n) => n + 1);
    });
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      stop();
      window.removeEventListener("focus", refresh);
    };
  }, [slug, epoch]);
  const score =
    game &&
    nbaHasScore(game) &&
    (/FINAL/.test(game.status || "") || nbaIsLive(game, now));
  return (
    <Shell active="game" sport="nba">
      <div className="nba-matchup-page">
        <Link href="/nba">← NBA games</Link>
        {loading && !game && <p role="status">Loading matchup…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button type="button" onClick={() => setEpoch((n) => n + 1)}>
              Retry
            </button>
          </p>
        )}
        {!loading && !error && !game && <h1>Matchup not found</h1>}
        {game && (
          <>
            <header className="nba-matchup-ticket">
              <span className="eyebrow">
                NBA · {nbaPhase(game.season_type)}
              </span>
              <h1>
                {game.away_team} @ {game.home_team}
              </h1>
              <div className="nba-matchup-teams">
                <div>
                  <NbaTeamLogo
                    team={game.away_team}
                    abbreviation={game.away_abbreviation}
                    size={80}
                  />
                  <b>{nbaNickname(game.away_team)}</b>
                  {score && <strong>{game.away_score}</strong>}
                </div>
                <span>@</span>
                <div>
                  <NbaTeamLogo
                    team={game.home_team}
                    abbreviation={game.home_abbreviation}
                    size={80}
                  />
                  <b>{nbaNickname(game.home_team)}</b>
                  {score && <strong>{game.home_score}</strong>}
                </div>
              </div>
              <p>
                {new Date(game.tipoff).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  ...(game.tipoff_tbd
                    ? {}
                    : { hour: "numeric", minute: "2-digit" }),
                })}
                {game.tipoff_tbd ? " · Time TBD" : " ET"} ·{" "}
                {game.venue || "Venue to be confirmed"}
              </p>
              <b>
                {/FINAL/.test(game.status || "")
                  ? "Final"
                  : nbaIsLive(game, now)
                    ? "Live"
                    : /POSTPON|CANCEL|SUSPEND/.test(game.status || "")
                      ? game.status?.replace("STATUS_", "").replaceAll("_", " ")
                      : !game.tipoff_tbd && Date.parse(game.tipoff) <= now
                        ? "Awaiting game update"
                        : "Scheduled"}
              </b>
            </header>
            {allowed ? (
              <NbaGameDetails
                key={`${game.id}-${epoch}`}
                game={game}
                now={now}
                defaultOpen
              />
            ) : (
              <p className="notice">
                <Link href="/membership">Sign in with research access</Link> for
                game lines, player props and recorded player form.
              </p>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
