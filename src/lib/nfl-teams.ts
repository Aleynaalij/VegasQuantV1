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

export function nflTeamCode(team: string): string | null {
  const value = team.trim().toLowerCase();
  if (value === "was" || value === "wsh") return "wsh";
  const name = Object.keys(teams).find(
    (name) =>
      value === name.toLowerCase() || value.endsWith(` ${name.toLowerCase()}`),
  );
  return name
    ? teams[name]
    : Object.values(teams).includes(value)
      ? value
      : null;
}
