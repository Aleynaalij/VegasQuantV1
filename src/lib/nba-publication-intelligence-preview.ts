import type { SupabaseClient } from "@supabase/supabase-js";
import { assessPublication } from "./nba-publication-intelligence";

export async function readPreviewPublicationIntelligence(db: SupabaseClient) {
  const checkedAt = "2026-11-16T15:36:00Z";
  const slate = "2026-11-16";
  const postId = "00000000-0000-4000-8000-000000000301";
  const common = {
    slate,
    checkedAt,
    schedule: { expression: "20 14,15 * * *", timezone: "UTC", active: true },
    runs: [
      {
        startedAt: "2026-11-16T15:20:01Z",
        completedAt: "2026-11-16T15:20:09Z",
        status: "succeeded",
      },
    ],
    scheduleFeedAt: "2026-11-16T15:30:00Z",
    eligibleGames: 4,
  };
  const fixtures = [
    assessPublication(
      {
        ...common,
        journal: {
          slate,
          status: "POSTED",
          postId,
          observedAt: "2026-11-16T15:20:08Z",
        },
        posts: [
          {
            id: postId,
            publishedAt: "2026-11-16T15:20:07Z",
            dealer: true,
            contentMatches: true,
          },
        ],
      },
      new Date(checkedAt),
      "fixture",
    ),
    assessPublication(
      { ...common, journal: null, posts: [] },
      new Date(checkedAt),
      "fixture",
    ),
  ];
  let live = null;
  // Only an explicitly configured, separate preview Supabase project may serve this read.
  const project = process.env.VQ_PUBLICATION_PREVIEW_PROJECT_REF;
  if (
    process.env.VERCEL_ENV === "preview" &&
    project &&
    /^[a-z]{20}$/.test(project) &&
    project !== "uowearboulykfcwnuirn" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === `https://${project}.supabase.co`
  ) {
    let payload: unknown = null;
    try {
      const response = await db
        .rpc("nba_publication_evidence", undefined, { get: true })
        .abortSignal(AbortSignal.timeout(2500));
      if (!response.error) payload = response.data;
    } catch {
      // A source outage is evidence unavailable.
    }
    live = assessPublication(payload, new Date(), "read-only source");
  }
  return { fixtures, live };
}
