import { americanPrice, type MoneylineRead } from "@/lib/home-props";

export const tone = (pct: number) =>
  pct >= 70 ? "good" : pct >= 50 ? "mid" : "low";

const nick = (team: string) => team.split(" ").at(-1) || team;

/** Card-face moneyline: both prices and the market favorite's no-vig win chance. */
export default function MoneylineFace({
  read,
  home,
  away,
  book = "FanDuel",
  homeLabel = nick(home),
  awayLabel = nick(away),
}: {
  read: MoneylineRead;
  home: string;
  away: string;
  book?: string;
  homeLabel?: string;
  awayLabel?: string;
}) {
  const favorite =
    read.home.probability >= read.away.probability ? "home" : "away";
  const team = favorite === "home" ? homeLabel : awayLabel;
  const pct = Math.round(read[favorite].probability * 100);
  return (
    <span className="vq-ml-face">
      <span className="vq-ml-chip">ML</span>
      <span className="vq-ml-prices">
        <span>
          {awayLabel} {americanPrice(read.away.price)}
        </span>
        <span>
          {homeLabel} {americanPrice(read.home.price)}
        </span>
      </span>
      <span
        className={`vq-ml-lean is-${tone(pct)}`}
        aria-label={`Market lean: ${team}, ${pct}% no-vig win chance at ${book}`}
      >
        <small>Market lean</small>
        <b>
          {team} {pct}%
        </b>
      </span>
    </span>
  );
}
