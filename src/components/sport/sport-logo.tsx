"use client";
import { useEffect, useRef, useState } from "react";
import type { Sport } from "@/lib/sports";
import TeamLogo from "../team-logo";
import NbaTeamLogo from "../nba-team-logo";

/**
 * ESPN logo by sport: NFL by team name, NBA and NHL by ESPN abbreviation, college teams by ESPN
 * numeric team ID. Anything unknown, or a logo that fails to load, shows the team's letters.
 */
export function sportLogoUrl(
  sport: Sport,
  abbreviation: string | null | undefined,
  espnId?: string | number | null,
) {
  if (sport === "nhl" && /^[a-z]{2,4}$/i.test(abbreviation || ""))
    return `https://a.espncdn.com/i/teamlogos/nhl/500/${abbreviation!.toLowerCase()}.png`;
  if (sport === "ncaab" && /^\d{1,6}$/.test(String(espnId ?? "")))
    return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;
  return null;
}

export default function SportLogo({
  sport,
  team,
  abbreviation = null,
  espnId = null,
  size = 40,
}: {
  sport: Sport;
  team: string;
  abbreviation?: string | null;
  espnId?: string | number | null;
  size?: number;
}) {
  if (sport === "nfl") return <TeamLogo team={team} size={size} />;
  if (sport === "nba")
    return <NbaTeamLogo team={team} abbreviation={abbreviation} size={size} />;
  return (
    <ImageLogo
      src={sportLogoUrl(sport, abbreviation, espnId)}
      letters={(
        abbreviation ||
        team
          .replace(/[^A-Za-z ]/g, "")
          .split(" ")
          .map((w) => w[0])
          .join("")
      )
        .slice(0, 4)
        .toUpperCase()}
      size={size}
    />
  );
}

function ImageLogo({
  src,
  letters,
  size,
}: {
  src: string | null;
  letters: string;
  size: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError; catch it here.
  useEffect(() => {
    const el = img.current;
    if (src && el?.complete && el.naturalWidth === 0) setFailed(src);
  }, [src]);
  return src && failed !== src ? (
    <img
      ref={img}
      className="team-logo"
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(src)}
    />
  ) : (
    <span
      className="team-logo team-logo-fallback"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {letters || "?"}
    </span>
  );
}
