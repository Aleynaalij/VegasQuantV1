"use client";
import { useEffect } from "react";
import Home2, { type Home2Props } from "@/components/home2/home2";
import { Shell } from "@/components/ui";
import { gameRoomHref } from "@/lib/game-room";
export default function HomeExperience(props: Omit<Home2Props, "gameHref">) {
  useEffect(() => {
    const forward = () => {
      if (
        window.location.pathname === "/" &&
        window.location.hash === "#home-games"
      )
        window.location.replace(`/nfl${window.location.search}#home-games`);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, []);
  return (
    <Shell active="lobby">
      <Home2 {...props} gameHref={gameRoomHref} />
    </Shell>
  );
}
