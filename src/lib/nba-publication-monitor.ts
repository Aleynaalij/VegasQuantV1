export type PublicationEvidence = {
  slate: string;
  checkedAt: string;
  scheduledAt: readonly [string, string];
  scheduler: { outcome: "succeeded" | "failed"; completedAt: string } | null;
  eligibility: { eligibleGames: number; observedAt: string } | null;
  journal: {
    slate: string;
    status: "POSTED" | "WAITING" | "SKIPPED" | "FAILED";
    postId: string | null;
    observedAt: string;
  } | null;
  post: {
    id: string;
    slate: string;
    author: "TheDealer" | "other";
    kind: "nba-threes" | "other";
    publishedAt: string;
  } | null;
};

export type PublicationStatus =
  | "PUBLISHED"
  | "WAITING"
  | "SKIPPED"
  | "NO_ELIGIBLE_SLATE"
  | "EVIDENCE_UNAVAILABLE";

const easternDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function verifyNbaPublication(evidence: PublicationEvidence): {
  status: PublicationStatus;
  reason: string;
} {
  const { slate, checkedAt, scheduledAt, eligibility, journal, post } =
    evidence;
  const checked = Date.parse(checkedAt);
  const onSlate = (value: string) => {
    const instant = Date.parse(value);
    return instant <= checked && easternDay.format(instant) === slate;
  };
  const unavailable = (reason: string) => ({
    status: "EVIDENCE_UNAVAILABLE" as const,
    reason,
  });

  if (
    !Number.isFinite(checked) ||
    easternDay.format(checked) !== slate ||
    (eligibility &&
      (!onSlate(eligibility.observedAt) ||
        !Number.isSafeInteger(eligibility.eligibleGames) ||
        eligibility.eligibleGames < 0)) ||
    (journal && (journal.slate !== slate || !onSlate(journal.observedAt)))
  ) {
    return unavailable("Evidence does not match the observed Eastern slate.");
  }

  if (journal?.status === "POSTED" || journal?.postId || post) {
    if (
      journal?.status === "POSTED" &&
      post &&
      journal.postId === post.id &&
      post.slate === slate &&
      post.author === "TheDealer" &&
      post.kind === "nba-threes" &&
      onSlate(post.publishedAt) &&
      Date.parse(post.publishedAt) <= Date.parse(journal.observedAt) &&
      eligibility?.eligibleGames !== 0
    ) {
      return {
        status: "PUBLISHED",
        reason: "The journal and original Dealer post match this slate.",
      };
    }
    return unavailable(
      "The journal and original Dealer post could not be matched.",
    );
  }

  if (eligibility?.eligibleGames === 0) {
    return {
      status: "NO_ELIGIBLE_SLATE",
      reason: "The slate evidence confirms zero eligible games.",
    };
  }
  if (!eligibility)
    return unavailable("Slate eligibility has not been verified.");

  if (journal?.status === "SKIPPED") {
    return {
      status: "SKIPPED",
      reason: "The publisher journal records a skip.",
    };
  }
  if (journal?.status === "WAITING") {
    return {
      status: "WAITING",
      reason: "The publisher journal records a wait.",
    };
  }
  if (!journal && checked < Date.parse(scheduledAt[0])) {
    return {
      status: "WAITING",
      reason: "The first scheduled attempt is still ahead.",
    };
  }
  return unavailable(
    "No verified publication or publisher disposition is available.",
  );
}
