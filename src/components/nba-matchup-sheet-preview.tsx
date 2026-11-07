import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { nbaMatchupPreview } from "@/lib/nba-matchup-sheet";
import { nbaNickname } from "@/lib/nba-home";
import type { PublicationPost } from "@/lib/zone-publication-card";
import BrandMark from "./brand-mark";
import NbaTeamLogo from "./nba-team-logo";

export default function NbaMatchupSheetPreview({
  post,
}: {
  post: PublicationPost;
}) {
  const { teams, tip, spread, total } = nbaMatchupPreview(post);
  return (
    <Link
      className="zone-sheet-preview"
      aria-label="Open matchup cheat sheet"
      href={`/nba/matchup-sheet/${post.id}`}
      prefetch={false}
    >
      <span className="zone-sheet-preview-brand">
        <BrandMark />
        <span>NBA MATCHUP CHEAT SHEET</span>
        <span className="zone-sheet-preview-tag">PREVIEW</span>
      </span>
      {teams && (
        <span className="zone-sheet-preview-teams">
          {teams.map(({ name, abbreviation }, i) => (
            <span className="zone-sheet-preview-team" key={name}>
              <NbaTeamLogo team={name} abbreviation={abbreviation} size={48} />
              <strong>{nbaNickname(name)}</strong>
              <small>{i === 0 ? "Away" : "Home"}</small>
            </span>
          ))}
          <span className="zone-sheet-preview-versus" aria-hidden="true">
            @
          </span>
        </span>
      )}
      {tip && <span className="zone-sheet-preview-tip">{tip}</span>}
      {(spread || total) && (
        <span className="zone-sheet-preview-lines">
          {spread && (
            <span>
              <small>FANDUEL SPREAD</small>
              <strong>{spread.value}</strong>
              <small>{spread.observed}</small>
            </span>
          )}
          {total && (
            <span>
              <small>FANDUEL TOTAL</small>
              <strong>{total.value}</strong>
              <small>{total.observed}</small>
            </span>
          )}
        </span>
      )}
      <span className="zone-sheet-preview-footer">
        <span>Team form · Player lines · 3-point volume · Injuries</span>
        <strong>
          Open matchup cheat sheet <ArrowUpRight size={15} aria-hidden="true" />
        </strong>
      </span>
    </Link>
  );
}
