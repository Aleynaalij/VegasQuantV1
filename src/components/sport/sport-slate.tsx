"use client";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import type { MoneylineRead } from "@/lib/home-props";
import { easternTime, upcomingSlate, type SlateGame } from "@/lib/sport-slate";
import MoneylineFace from "./moneyline-face";
import SportLogo from "./sport-logo";

/**
 * The week's games as Home rows for any sport, matching NFL's list: teams, start time, a chevron,
 * the moneyline face when there is one, and the game's markets inside when it opens.
 */
export default function SportSlate({
  games,
  faces = {},
  onOpen,
  children,
  empty = "No games scheduled this week.",
}: {
  games: SlateGame[];
  faces?: Record<string, MoneylineRead>;
  /** Called the first time any game opens, so markets load only when wanted. */
  onOpen?: () => void;
  children: (game: SlateGame) => ReactNode;
  empty?: string;
}) {
  const slate = upcomingSlate(games);
  return (
    <section
      id="sport-games"
      className="vq-game-list"
      aria-label="This week's games"
    >
      {slate.length === 0 ? <p className="vq-slate-empty">{empty}</p> : null}
      {slate.map((g) => (
        <details
          key={g.id}
          className="vq-game-row"
          data-game={g.id}
          onToggle={(e) => {
            if (e.currentTarget.open) onOpen?.();
          }}
        >
          <summary>
            <span className="vq-game-head">
              <span className="vq-game-teams">
                <SportLogo
                  sport={g.sport}
                  team={g.away.name}
                  abbreviation={g.away.abbreviation}
                  espnId={g.away.espnId}
                  size={26}
                />
                <b>{g.away.short}</b>
                <small>{g.neutral ? "vs" : "@"}</small>
                <SportLogo
                  sport={g.sport}
                  team={g.home.name}
                  abbreviation={g.home.abbreviation}
                  espnId={g.home.espnId}
                  size={26}
                />
                <b>{g.home.short}</b>
              </span>
              <span className="vq-game-when">
                <span className="vq-game-time">
                  {g.tbd
                    ? `${easternTime(g.start, { weekday: "short" })} · TBD`
                    : `${easternTime(g.start, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })} ET`}
                </span>
                <ChevronDown
                  className="vq-expand-chevron"
                  size={20}
                  aria-hidden="true"
                />
              </span>
            </span>
            {faces[g.id] ? (
              <MoneylineFace
                read={faces[g.id]}
                home={g.home.name}
                away={g.away.name}
                homeLabel={g.home.short}
                awayLabel={g.away.short}
              />
            ) : null}
          </summary>
          <div className="vq-game-props">{children(g)}</div>
        </details>
      ))}
    </section>
  );
}
