"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Shell } from "./ui";
import VqTonight from "./vq-tonight";
import HomeRecordCard from "./home-record";
import SectionBoundary from "./section-boundary";
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

/** Old links pointed at the NFL desk's game list on "/" with only a hash; send them to /nfl. */
function LegacyHashForward() {
  useEffect(() => {
    if (window.location.hash === "#home-games") window.location.replace("/nfl#home-games");
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
        <div className="vq-lobby-lights" aria-hidden="true" />
        <p className="vq-lobby-eyebrow">The Vegas Quant skybox</p>
        <h1 id="vq-lobby-title">Every game. One clear read.</h1>
        <p className="vq-lobby-lede">
          Sports research, the picks we like with the reasons and risks, and a member community kept
          separate from published research. Pick a desk to start.
        </p>
        <nav className="vq-lobby-desks" aria-label="Sport desks">
          {liveSports().map((key) => {
            const tile = (
              <Link key={key} href={SPORTS[key].home} className="vq-lobby-desk" data-sport={key}>
                <b>{SPORTS[key].name}</b>
                <small>{DESK[key]}</small>
                <span className="vq-lobby-go">
                  Open desk <ArrowRight size={15} aria-hidden="true" />
                </span>
              </Link>
            );
            // NHL keeps the same invitation hold as its sport chip.
            return key === "nhl" ? <NhlChipHold key={key}>{tile}</NhlChipHold> : tile;
          })}
        </nav>
      </section>

      <SectionBoundary name="VQ Tonight">
        <VqTonight nflGames={nflGames} />
      </SectionBoundary>

      {/* VQ Tonight carries My lays (or "Continue your lay") and The Zone (or its sign-in). */}
      <section className="vq-lobby-tools" aria-label="More from Vegas Quant">
        <LobbyTool
          href="/parlays?build=1"
          icon={<span className="vq-lobby-diamond" aria-hidden="true">+</span>}
          title="Build a lay"
          body="Start a new lay from the current NFL player legs. Nothing is placed or shared unless you choose to."
        />
        <LobbyTool
          href="/slots"
          icon={<span className="vq-lobby-diamond" aria-hidden="true">♦</span>}
          title="VQ Slots"
          body="Spin up a random set of legs from the current board, for fun. Not a recommendation."
        />
      </section>

      <SectionBoundary name="Track record">
        <HomeRecordCard />
      </SectionBoundary>
    </Shell>
  );
}

function LobbyTool({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
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
