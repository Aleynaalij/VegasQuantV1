"use client";
import { useState } from "react";
const teams: Record<string, string> = {
  Cardinals: "ari",
  Falcons: "atl",
  Ravens: "bal",
  Bills: "buf",
  Panthers: "car",
  Bears: "chi",
  Bengals: "cin",
  Browns: "cle",
  Cowboys: "dal",
  Broncos: "den",
  Lions: "det",
  Packers: "gb",
  Texans: "hou",
  Colts: "ind",
  Jaguars: "jax",
  Chiefs: "kc",
  Raiders: "lv",
  Chargers: "lac",
  Rams: "lar",
  Dolphins: "mia",
  Vikings: "min",
  Patriots: "ne",
  Saints: "no",
  Giants: "nyg",
  Jets: "nyj",
  Eagles: "phi",
  Steelers: "pit",
  "49ers": "sf",
  Seahawks: "sea",
  Buccaneers: "tb",
  Titans: "ten",
  Commanders: "wsh",
};
export default function TeamLogo({
  team,
  size = 40,
}: {
  team: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const code =
    teams[team.split(" ").at(-1) || team] ||
    ({ was: "wsh", WSH: "wsh" } as Record<string, string>)[team] ||
    (Object.values(teams).includes(team.toLowerCase())
      ? team.toLowerCase()
      : null);
  return code && !failed ? (
    <img
      className="team-logo"
      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
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
