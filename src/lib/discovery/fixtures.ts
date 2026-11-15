import type { HubData } from "../research-hub-reader";
import type { GameZonePost } from "../game-zone-posts";
import { SPORT_ORDER } from "../sports";
/** Explicit synthetic records: contract-shaped, never silently substituted for reader failures. */
export const stagingDiscoveryFixture: HubData = {
  signedIn: true,
  denied: false,
  errors: [],
  truncated: false,
  events: SPORT_ORDER.map((sport, i) => ({
    key: `${sport}:fixture-${sport}`,
    id: `fixture-${sport}`,
    sport,
    slug: `fixture-${sport}`,
    away: `Sample ${sport.toUpperCase()} Visitors`,
    home: `Sample ${sport.toUpperCase()} Hosts`,
    start: `2026-11-15T${18 + i}:00:00Z`,
    tbd: false,
    venue: "Synthetic arena",
    status: "SCHEDULED · SAMPLE",
    source: null,
    scheduleAt: null,
  })),
  findings: [
    {
      id: "fixture-availability",
      eventKey: "nba:fixture-nba",
      topic: "injuries",
      title: "Sample availability report",
      text: "Synthetic example: a starter remains questionable. This is not current player information. Open the full report before forming a view.",
      sources: [],
      sourceAt: "2026-11-15T12:00:00Z",
      recordedAt: "2026-11-15T12:05:00Z",
      label: "Provider report",
    },
    {
      id: "fixture-correction",
      eventKey: "nba:fixture-nba",
      topic: "overview",
      title: "Sample correction notice",
      text: "Synthetic correction example: an earlier role description was corrected. This excerpt preserves the correction label and original publication destination; it does not claim an immutable history service exists.",
      sources: [],
      sourceAt: null,
      recordedAt: "2026-11-15T13:10:00Z",
      label: "Published research",
      publicationHref:
        "/community?sport=nba&post=fixture-correction#post-fixture-correction",
    },
    {
      id: "fixture-goalie",
      eventKey: "nhl:fixture-nhl",
      topic: "context",
      title: "Sample goalie status: unconfirmed",
      text: "Synthetic example: starting goalie has not been confirmed. Missing confirmation is not a confirmed lineup or a recommendation.",
      sources: [],
      sourceAt: null,
      recordedAt: "2026-11-15T12:30:00Z",
      label: "Provider report",
    },
    {
      id: "fixture-weather",
      eventKey: "nfl:fixture-nfl",
      topic: "weather",
      title: "Sample weather coverage",
      text: "Synthetic example demonstrating a sourced report placeholder. No weather measurement has been invented.",
      sources: [],
      sourceAt: null,
      recordedAt: null,
      label: "Provider report",
    },
  ],
};
export const stagingPostFixtures: Record<string, GameZonePost[]> = {
  "nba:fixture-nba": [
    {
      id: "fixture-correction",
      sport: "nba",
      kind: "talk",
      title: "Sample corrected research publication",
      body: "Synthetic publication. The original card and full discussion remain at the existing canonical post destination. This is not a live recommendation.",
      legs: [],
      card: null,
      photo_path: null,
      author_name: "TheDealer · sample",
      created_at: "2026-11-15T13:10:00Z",
      comments: 0,
      reactions: 0,
    },
  ],
};
export function fixtureScenario(scenario: string | null): HubData {
  if (scenario === "signed-out")
    return {
      ...stagingDiscoveryFixture,
      signedIn: false,
      denied: true,
      findings: [],
    };
  if (scenario === "denied")
    return { ...stagingDiscoveryFixture, denied: true, findings: [] };
  if (scenario === "unavailable")
    return {
      ...stagingDiscoveryFixture,
      findings: [],
      errors: [
        "SAMPLE: NBA research source unavailable. Retry to check this sport.",
      ],
      truncated: true,
    };
  if (scenario === "empty")
    return { ...stagingDiscoveryFixture, events: [], findings: [] };
  return stagingDiscoveryFixture;
}
