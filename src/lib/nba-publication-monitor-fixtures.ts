import {
  verifyNbaPublication,
  type PublicationEvidence,
} from "./nba-publication-monitor";

const slate = "2026-11-16";
const timestamp = (time: string) => `${slate}T${time}Z`;
const postId = "00000000-0000-4000-8000-000000000301";
const base: PublicationEvidence = {
  slate,
  checkedAt: timestamp("15:25:00"),
  scheduledAt: [timestamp("14:20:00"), timestamp("15:20:00")],
  scheduler: { outcome: "succeeded", completedAt: timestamp("15:20:10") },
  eligibility: { eligibleGames: 4, observedAt: timestamp("14:15:00") },
  journal: null,
  post: null,
};

const examples: ReadonlyArray<{
  label: string;
  evidence: PublicationEvidence;
}> = [
  {
    label: "Verified Dealer post",
    evidence: {
      ...base,
      journal: {
        slate,
        status: "POSTED",
        postId,
        observedAt: timestamp("15:20:07"),
      },
      post: {
        id: postId,
        slate,
        author: "TheDealer",
        kind: "nba-threes",
        publishedAt: timestamp("15:20:06"),
      },
    },
  },
  {
    label: "Publisher waiting",
    evidence: {
      ...base,
      journal: {
        slate,
        status: "WAITING",
        postId: null,
        observedAt: timestamp("15:20:07"),
      },
    },
  },
  {
    label: "Publisher skipped",
    evidence: {
      ...base,
      journal: {
        slate,
        status: "SKIPPED",
        postId: null,
        observedAt: timestamp("15:20:07"),
      },
    },
  },
  {
    label: "No eligible games",
    evidence: {
      ...base,
      eligibility: { eligibleGames: 0, observedAt: timestamp("14:15:00") },
    },
  },
  {
    label: "Scheduler succeeded, publication evidence missing",
    evidence: base,
  },
];

export function previewNbaPublicationMonitor() {
  return examples.map(({ label, evidence }) => ({
    label,
    ...verifyNbaPublication(evidence),
    evidence,
  }));
}
