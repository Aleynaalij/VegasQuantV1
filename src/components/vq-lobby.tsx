"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ArrowRight, Grid2X2, Plus, Diamond } from "lucide-react";
import { Shell } from "./ui";
import VqTonight from "./vq-tonight";
import HomeRecordCard from "./home-record";
import SectionBoundary from "./section-boundary";
import CommunityStories from "./community-stories";
import {
  LOBBY_SKYLINE,
  LobbyArenaPennants,
  LobbyArenaSkyline,
} from "./lobby-arena-decor";
import { NhlChipHold } from "./frank-anniversary-gate";
import { liveSports, SPORTS, type Sport } from "@/lib/sports";
import type { Game } from "@/lib/domain";
import "@/app/vq-lobby.css";

// What each desk actually offers, in plain words (no counts, availability or results implied).
const DESK: Record<Sport, string> = {
  nfl: "Weekly slate, game research, player props and published picks.",
  nba: "Tonight’s games, lineups and research, with picks when the data qualifies.",
  nhl: "Today’s games and research, with picks only after the data checks out.",
  ncaab: "Today’s games and research for college basketball.",
};

/**
 * Old links pointed at the NFL desk's game list on "/" with only a hash (which never reaches the
 * server), so the lobby forwards them to /nfl itself: on arrival and on a later hash change while
 * the lobby is open, keeping every query value (repeated keys included). `replace` swaps the old
 * entry, so Back returns to the page before it rather than looping into the lobby again.
 */
function LegacyHashForward() {
  useEffect(() => {
    const forward = () => {
      if (
        window.location.pathname !== "/" ||
        window.location.hash !== "#home-games"
      )
        return;
      window.location.replace(`/nfl${window.location.search}#home-games`);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, []);
  return null;
}

/**
 * The neutral Vegas Quant lobby: every sport, tonight's games across them, and the member tools.
 * It belongs to no sport (no chip selected, no NFL-only claims) and shows only real data: games come
 * from VQ Tonight's checked schedules and the record card appears only when the record is public.
 */
export default function VqLobby({ nflGames }: { nflGames: Game[] }) {
  return (
    <Shell active="lobby">
      <LegacyHashForward />
      <section className="vq-lobby-skybox" aria-labelledby="vq-lobby-title">
        <LobbyArenaPennants />
        <h1 id="vq-lobby-title">
          Your sports research <br />
          starts here.
        </h1>
        <p className="vq-lobby-lede">
          Research with reasons and risks, across every sport.
        </p>
        <h2 className="vq-lobby-section-title">Sports rooms</h2>
        <nav className="vq-lobby-desks" aria-label="Sport desks">
          {liveSports().map((key) => {
            const tile = (
              <Link
                key={key}
                href={SPORTS[key].home}
                className="vq-lobby-desk"
                data-sport={key}
                aria-label={`Open ${key === "ncaab" ? "NCAAB college basketball" : SPORTS[key].name} desk`}
                aria-describedby={`vq-lobby-desk-${key}-description`}
              >
                <LobbySportIcon sport={key} />
                <b>
                  <span className="vq-lobby-desk-name">{SPORTS[key].name}</span>
                  <span className="vq-lobby-desk-label" aria-hidden="true">
                    {SPORTS[key].label}
                  </span>
                </b>
                <small id={`vq-lobby-desk-${key}-description`}>
                  {DESK[key]}
                </small>
              </Link>
            );
            // NHL keeps the same invitation hold as its sport chip.
            return key === "nhl" ? (
              <NhlChipHold key={key}>{tile}</NhlChipHold>
            ) : (
              tile
            );
          })}
        </nav>
        {/* Keep hash entries in the App Router's history so Back from a game restores Home. */}
        <Link className="vq-lobby-all-sports" href="#vq-tonight">
          <Grid2X2 size={20} aria-hidden="true" /> All sports{" "}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>

      <CommunityStories placement="lobby" />

      <SectionBoundary name="VQ Tonight">
        <VqTonight nflGames={nflGames} presentation="skybox" />
      </SectionBoundary>

      {/* Claude's isolated Intelligence component mounts here after its handoff. */}
      <LobbyArenaSkyline src={LOBBY_SKYLINE.src} />
      <SectionBoundary name="Track record">
        <HomeRecordCard />
      </SectionBoundary>

      {/* VQ Tonight carries My lays (or "Continue your lay") and The Zone (or its sign-in). */}
      <section className="vq-lobby-tools" aria-label="More from Vegas Quant">
        <LobbyTool
          href="/parlays?build=1"
          icon={<Plus aria-hidden="true" />}
          title="Build a lay"
          body="Start a new lay from the current NFL player legs. Nothing is placed or shared unless you choose to."
        />
        <LobbyTool
          href="/slots"
          icon={<Diamond aria-hidden="true" />}
          title="VQ Slots"
          body="Spin up a random set of legs from the current board, for fun. Not a recommendation."
        />
      </section>
    </Shell>
  );
}

function LobbyTool({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="vq-lobby-tool">
      <span className="vq-lobby-tool-icon">{icon}</span>
      <span>
        <b>{title}</b>
        <small>{body}</small>
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

/** Small vector room signs, not team logos or claims about a scheduled game. */
function LobbySportIcon({ sport }: { sport: Sport }) {
  return (
    <svg
      className="vq-lobby-sport-icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {sport === "nfl" ? (
        <g transform="rotate(38 16 16)">
          <ellipse cx="16" cy="16" rx="8" ry="13" />
          <path d="M16 9v14M12 12h8M12 16h8M12 20h8M10 7h12M10 25h12" />
        </g>
      ) : sport === "nhl" ? (
        <>
          <path d="m25 4-13 20H4v4h10L28 6" />
          <ellipse cx="25" cy="27" rx="4" ry="2" />
        </>
      ) : (
        <>
          <circle cx="16" cy="16" r="13" />
          <path d="M3 16h26M16 3v26M7 6c12 6 12 14 0 20M25 6c-12 6-12 14 0 20" />
        </>
      )}
    </svg>
  );
}
