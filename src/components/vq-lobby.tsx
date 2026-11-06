"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { ChevronRight, Crosshair, Gauge, Layers, LayoutGrid, Search, ChartNoAxesColumnIncreasing } from "lucide-react";
import { Shell } from "./ui";
import VqTonight, { useLayDraft } from "./vq-tonight";
import HomeRecordCard from "./home-record";
import SectionBoundary from "./section-boundary";
import { NhlChipHold } from "./frank-anniversary-gate";
import { liveSports, SPORTS, type Sport } from "@/lib/sports";
import type { Game } from "@/lib/domain";
import "@/app/vq-lobby.css";

/**
 * Old links pointed at the NFL desk's game list on "/" with only a hash (which never reaches the
 * server), so the lobby forwards them to /nfl itself: on arrival and on a later hash change while
 * the lobby is open, keeping every query value (repeated keys included). `replace` swaps the old
 * entry, so Back returns to the page before it rather than looping into the lobby again.
 */
function LegacyHashForward() {
  useEffect(() => {
    const forward = () => {
      if (window.location.pathname !== "/" || window.location.hash !== "#home-games") return;
      window.location.replace(`/nfl${window.location.search}#home-games`);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, []);
  return null;
}

/* Line icons for the sport rooms, drawn to match the lucide set (24px grid, 1.8 stroke). */
const svg = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Football = () => (
  <svg {...svg} aria-hidden="true">
    <path d="M4.5 19.5c-1.4-4.6.2-9.6 3.6-13 3.4-3.4 8.4-5 13-3.6 1.4 4.6-.2 9.6-3.6 13-3.4 3.4-8.4 5-13 3.6Z" />
    <path d="m9 15 6-6M10.5 10.5l1.5 1.5M12.5 8.5 14 10M8.5 12.5 10 14" />
  </svg>
);
const Basketball = () => (
  <svg {...svg} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3v18M5.6 5.6c2.6 2.4 3.4 6.4 1.6 12.6M18.4 5.6c-2.6 2.4-3.4 6.4-1.6 12.6" />
  </svg>
);
const Hockey = () => (
  <svg {...svg} aria-hidden="true">
    <path d="M17 3 9.5 17.5c-.4.8-1.2 1.3-2.1 1.3H3" />
    <ellipse cx="17" cy="19.5" rx="3.5" ry="1.5" />
  </svg>
);
const ROOM_ICON: Record<Sport, () => ReactNode> = { nfl: Football, nba: Basketball, nhl: Hockey, ncaab: Basketball };

/** A gold rule with a spaced label between two lines, as section headers on the lobby. */
function Rule({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className="vq-rule" id={id}>
      <span>{children}</span>
    </h2>
  );
}

/** The hanging green pennants either side of the headline (decoration only). */
function Pennant({ side }: { side: "left" | "right" }) {
  return (
    <svg className={`vq-pennant vq-pennant-${side}`} viewBox="0 0 40 80" aria-hidden="true">
      <path d="M2 0h36v62L20 78 2 62Z" fill="#0d3b2b" stroke="#c9a85a" strokeWidth="1.6" />
      <path d="M20 26c-4 5-9 7-9 11.5 0 2.6 2 4.5 4.4 4.5 1.5 0 2.8-.7 3.6-1.8L18 46h4l-1-5.8c.8 1.1 2.1 1.8 3.6 1.8 2.4 0 4.4-1.9 4.4-4.5C29 33 24 31 20 26Z" fill="#e2c272" />
    </svg>
  );
}

/** The Strip at night along the foot of the lobby: towers, the wheel, the tower and palms. */
function Skyline() {
  return (
    <div className="vq-skyline" aria-hidden="true">
      <svg viewBox="0 0 400 110" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="vq-sky-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6d98a" />
            <stop offset="1" stopColor="#8a6424" />
          </linearGradient>
          <pattern id="vq-sky-windows" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="#1a140a" />
            <rect x="0.8" y="0.8" width="2" height="1.6" fill="#f2cf7a" />
          </pattern>
        </defs>
        {/* towers */}
        <g fill="url(#vq-sky-windows)" stroke="#a7802f" strokeWidth=".6">
          <path d="M18 110V66h22v44Z" />
          <path d="M44 110V52c8-6 22-6 30 0v58Z" />
          <path d="M78 110V60h16v50Z" />
          <path d="M150 110V70h20v40Z" />
          <path d="M232 110V58h14v52Z" />
          <path d="M250 110V48c6-4 16-4 22 0v62Z" />
          <path d="M318 110V62h24v48Z" />
          <path d="M346 110V54c7-5 19-5 26 0v56Z" />
        </g>
        {/* the wheel */}
        <g stroke="url(#vq-sky-gold)" fill="none" strokeWidth="1.2">
          <circle cx="196" cy="70" r="26" />
          <circle cx="196" cy="70" r="3" fill="#f2cf7a" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1="196" y1="70" x2={196 + 26 * Math.cos(a)} y2={70 + 26 * Math.sin(a)} strokeWidth=".7" />;
          })}
          <path d="M184 110 196 72l12 38" />
        </g>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <circle key={i} cx={196 + 26 * Math.cos(a)} cy={70 + 26 * Math.sin(a)} r="1.6" fill="#ff6b8a" />;
        })}
        {/* the tower */}
        <g fill="none" stroke="url(#vq-sky-gold)" strokeWidth="1.1">
          <path d="M280 110 292 40l12 70M284.5 86h15M287.5 66h9M290 52h4" />
          <path d="M292 40v-12" />
        </g>
        {/* palms */}
        <g fill="#0b1a12" stroke="#173a26" strokeWidth=".6">
          {[8, 112, 132, 222, 384].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i % 2 ? 72 : 78})`}>
              <path d="M0 32 1.6 0h1.2L4 32Z" />
              <path d="M2 0c-6-4-11-3-14 1 4-1 9-1 14-1ZM2 0c6-4 11-3 14 1-4-1-9-1-14-1ZM2 0c-3-5-8-7-12-6 4 1 8 3 12 6ZM2 0c3-5 8-7 12-6-4 1-8 3-12 6Z" />
            </g>
          ))}
        </g>
        <rect y="106" width="400" height="4" fill="#0a0d11" />
      </svg>
    </div>
  );
}

/**
 * The neutral Vegas Quant lobby: a casino skybox over the sport rooms, tonight's games across every
 * sport on the scoreboard, the member's next moves and what's coming. It belongs to no sport (no chip
 * selected, no NFL-only claims) and shows only real data: games come from VQ Tonight's checked
 * schedules, concepts are labelled and not linked, and the record card appears only when public.
 */
export default function VqLobby({ nflGames, serifClass = "" }: { nflGames: Game[]; serifClass?: string }) {
  const { signedIn, draft } = useLayDraft();
  return (
    <Shell active="lobby">
      <LegacyHashForward />
      <div className={`vq-skybox ${serifClass}`}>
        <section className="vq-sky-hero" aria-labelledby="vq-lobby-title">
          <div className="vq-sky-lights" aria-hidden="true" />
          <Pennant side="left" />
          <Pennant side="right" />
          <h1 id="vq-lobby-title">
            Your sports research <span>starts here.</span>
          </h1>
          <svg className="vq-sky-swash" viewBox="0 0 240 14" aria-hidden="true">
            <path d="M4 11C70 1 170 1 236 11" fill="none" stroke="#1f9b6c" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </section>

        <section className="vq-rooms" aria-labelledby="vq-rooms-title">
          <Rule id="vq-rooms-title">Sports rooms</Rule>
          <nav className="vq-rooms-grid" aria-label="Sport desks">
            {liveSports().map((key) => {
              const Icon = ROOM_ICON[key];
              const room = (
                <Link key={key} href={SPORTS[key].home} className="vq-room" data-sport={key}>
                  <Icon />
                  <span>{key === "ncaab" ? "College Basketball" : SPORTS[key].label}</span>
                </Link>
              );
              // NHL keeps the same invitation hold as its sport chip.
              return key === "nhl" ? <NhlChipHold key={key}>{room}</NhlChipHold> : room;
            })}
          </nav>
          <a className="vq-rooms-all" href="#vq-tonight">
            <LayoutGrid size={20} aria-hidden="true" /> All Sports tonight <ChevronRight size={18} aria-hidden="true" />
          </a>
        </section>

        <SectionBoundary name="VQ Tonight">
          <VqTonight nflGames={nflGames} variant="scoreboard" />
        </SectionBoundary>

        <section className="vq-moves" aria-labelledby="vq-moves-title">
          <Rule id="vq-moves-title">Your next move</Rule>
          <div className="vq-moves-grid">
            <Link className="vq-move" href="/feed?view=latest">
              <Search size={24} aria-hidden="true" />
              <span>Research</span>
            </Link>
            <Link className="vq-move" href="/parlays" aria-label={draft ? `Your Lays: continue your lay, ${draft} selected` : "Your Lays"}>
              <Layers size={24} aria-hidden="true" />
              <span>
                Your Lays
                {draft ? <small>{draft} selected</small> : null}
              </span>
            </Link>
            <Link className="vq-move" href={signedIn === false ? "/membership" : "/community"} aria-label={signedIn === false ? "The Zone: sign in" : "The Zone"}>
              <Crosshair size={24} aria-hidden="true" />
              <span>
                The Zone
                {signedIn === false ? <small>Sign in</small> : null}
              </span>
            </Link>
          </div>
        </section>

        <section className="vq-intel" aria-labelledby="vq-intel-title">
          <Rule id="vq-intel-title">VQ Intelligence</Rule>
          <ul className="vq-intel-grid">
            <li className="vq-intel-card">
              <ChartNoAxesColumnIncreasing size={24} aria-hidden="true" />
              <b>Simulator</b>
              <span className="vq-concept">Concept</span>
              <small>Game simulation in development. Not available to members yet.</small>
            </li>
            <li className="vq-intel-card">
              <Gauge size={24} aria-hidden="true" />
              <b>Fear Index</b>
              <span className="vq-concept">Concept</span>
              <small>A market-mood gauge in development. Not available yet.</small>
            </li>
          </ul>
        </section>

        <SectionBoundary name="Track record">
          <HomeRecordCard />
        </SectionBoundary>

        <Skyline />
      </div>
    </Shell>
  );
}
