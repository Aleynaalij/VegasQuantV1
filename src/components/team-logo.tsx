"use client";
import { useState } from "react";
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
  return code && failedCode !== code ? (
    <img
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
