"use client";
import { useEffect, useRef, useState } from "react";
import { nflTeamCode } from "@/lib/nfl-teams";
export default function TeamLogo({
  team,
  size = 40,
}: {
  team: string;
  size?: number;
}) {
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const code = nflTeamCode(team);
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
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`}
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
      {team.split(" ").at(-1)?.slice(0, 3).toUpperCase()}
    </span>
  );
}
