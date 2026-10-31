"use client";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
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
  quoteTimes = {},
  onOpen,
  children,
  empty = "No games scheduled this week.",
}: {
  games: SlateGame[];
  faces?: Record<string, MoneylineRead>;
  quoteTimes?: Record<string, { observedAt: string; stale: boolean }>;
  /** Called the first time any game opens, so markets load only when wanted. */
  onOpen?: () => void;
  children: (game: SlateGame) => ReactNode;
  empty?: string;
}) {
  const slate = upcomingSlate(games);
  const [visible, setVisible] = useState(32);
  return (
    <section
      id="sport-games"
      className="vq-game-list"
      aria-label="This week's games"
    >
      {slate.length === 0 ? <p className="vq-slate-empty">{empty}</p> : null}
      {slate.slice(0, visible).map((g) => (
        <GameRow
          key={g.id}
          game={g}
          face={faces[g.id]}
          quoteTime={quoteTimes[g.id]}
          onOpen={onOpen}
        >
          {children}
        </GameRow>
      ))}
      {slate.length > visible ? (
        <button
          type="button"
          className="vq-btn ghost"
          onClick={() => setVisible((n) => n + 32)}
        >
          Show more games ({slate.length - visible} remaining)
        </button>
      ) : null}
    </section>
  );
}

function GameRow({
  game: g,
  face,
  quoteTime,
  onOpen,
  children,
}: {
  game: SlateGame;
  face?: MoneylineRead;
  quoteTime?: { observedAt: string; stale: boolean };
  onOpen?: () => void;
  children: (game: SlateGame) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="vq-game-row"
      data-game={g.id}
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
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
        {face ? (
          <MoneylineFace
            read={face}
            quoteTime={quoteTime}
            home={g.home.name}
            away={g.away.name}
            homeLabel={g.home.short}
            awayLabel={g.away.short}
          />
        ) : null}
      </summary>
      <div className="vq-game-props">{open ? children(g) : null}</div>
    </details>
  );
}
