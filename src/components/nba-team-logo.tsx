"use client";
import { useEffect, useRef, useState } from "react";
import { nbaLogoCode, nbaNickname } from "@/lib/nba-home";
/** ESPN NBA team logo from the ESPN abbreviation stored on nba_games; text fallback like TeamLogo. */
export default function NbaTeamLogo({
  team,
  abbreviation,
  size = 40,
}: {
  team: string;
  abbreviation: string | null;
  size?: number;
}) {
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const code = nbaLogoCode(abbreviation);
  const img = useRef<HTMLImageElement>(null);
  // An image that failed before hydration never fires onError; catch it here.
  useEffect(() => {
    const el = img.current;
    if (code && el?.complete && el.naturalWidth === 0) setFailedCode(code);
  }, [code]);
  return code && failedCode !== code ? (
    <img
      ref={img}
      className="team-logo"
      src={`https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailedCode(code)}
    />
  ) : (
    <span
      className="team-logo team-logo-fallback"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {(abbreviation || nbaNickname(team)).slice(0, 4).toUpperCase()}
    </span>
  );
}
