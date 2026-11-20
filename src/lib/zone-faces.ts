/**
 * Player faces for The Zone: finds known players named in a post (title, legs, opening text) and
 * returns their headshots. Registries are name → id lists built from our own data: NFL (ESPN ids),
 * NBA (ESPN ids from nba_player_results), NHL (NHL.com ids + team from the NHL chart rosters).
 * Unknown names get no face; a face that fails to load falls back to initials in the component.
 */
import nfl from "./nfl-portraits.json";
import nba from "./nba-portraits.json";
import nhl from "./nhl-portraits.json";

export type FaceSport = "nba" | "nfl" | "nhl";
export type ZoneFace = { sport: FaceSport; name: string; src: string };

/** "Luka Dončić Jr." → "luka doncic": accents, punctuation and Jr/Sr/II–IV suffixes dropped. */
export function faceKey(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/'/g, "")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv)$/.test(w))
    .join(" ");
}

/** ESPN-style team codes in our NHL rosters → NHL.com tricodes used in headshot paths. */
const NHL_TRICODE: Record<string, string> = {
  SJ: "SJS",
  LA: "LAK",
  NJ: "NJD",
  TB: "TBL",
};

type Entry = { name: string; src: string };
let built: Record<FaceSport, Map<string, Entry>> | null = null;
const title = (key: string) => key.replace(/\b[a-z]/g, (c) => c.toUpperCase());

function registries() {
  if (built) return built;
  const make = (pairs: [string, Entry][]) =>
    new Map(pairs.map(([k, e]) => [faceKey(k), e]));
  built = {
    nfl: make(
      Object.entries(nfl.portraits as Record<string, string>).map(([k, id]) => [
        k,
        {
          name: title(k),
          src: `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,
        },
      ]),
    ),
    nba: make(
      Object.entries(nba.portraits as Record<string, string>).map(([k, id]) => [
        k,
        {
          name: title(k),
          src: `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`,
        },
      ]),
    ),
    nhl: make(
      Object.entries(
        nhl.portraits as unknown as Record<string, [string, string]>,
      ).map(([k, [id, team]]) => [
        k,
        {
          name: title(k),
          src: `https://assets.nhle.com/mugs/nhl/${nhl.season}/${NHL_TRICODE[team] || team}/${id}.png`,
        },
      ]),
    ),
  };
  return built;
}

const SPORTS: FaceSport[] = ["nba", "nfl", "nhl"];

/**
 * Up to `limit` distinct players named in `text`, in order of first mention. A post tagged with one
 * of the three sports only matches that sport's players; anything else tries all three.
 */
export function findFaces(
  text: string,
  sport?: string | null,
  limit = 3,
): ZoneFace[] {
  const pools = SPORTS.includes(sport as FaceSport)
    ? [sport as FaceSport]
    : SPORTS;
  const words = faceKey(text).split(" ").filter(Boolean);
  const reg = registries();
  const out: ZoneFace[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < words.length && out.length < limit; i++) {
    // Longest name first (up to four words) so "karl anthony towns" beats a shorter overlap.
    for (let n = 4; n >= 2; n--) {
      if (i + n > words.length) continue;
      const key = words.slice(i, i + n).join(" ");
      const pool = pools.find((p) => reg[p].has(key));
      if (!pool) continue;
      if (!seen.has(`${pool}:${key}`)) {
        seen.add(`${pool}:${key}`);
        const e = reg[pool].get(key)!;
        out.push({ sport: pool, name: e.name, src: e.src });
      }
      i += n - 1;
      break;
    }
  }
  return out;
}

/** Initials for the fallback badge: "Karl-Anthony Towns" → "KT". */
export const faceInitials = (name: string) => {
  const w = name.split(/[\s-]+/).filter(Boolean);
  return (
    (w[0]?.[0] || "") + (w.length > 1 ? w[w.length - 1][0] : "")
  ).toUpperCase();
};
