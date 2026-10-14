import { test } from "node:test";
import assert from "node:assert/strict";
import { feedAlerts, researchDeadline } from "../src/lib/feed-health";
test("feed health rejects stale, missing and partial providers", () => {
  const now = Date.parse("2026-10-05T20:00:00Z");
  const alerts = feedAlerts(
    [
      { provider: "ESPN", status: "ok", created_at: "2026-10-05T19:20:00Z" },
      {
        provider: "The Odds API props",
        status: "partial",
        created_at: "2026-10-05T19:59:00Z",
      },
    ],
    now,
  );
  assert.equal(alerts.length, 5);
  assert.ok(alerts.some((a) => a.reason === "partial"));
});
test("research deadlines use Eastern time, grace period and actual publications", () => {
  assert.equal(
    researchDeadline(null, Date.parse("2026-10-05T16:10:00Z")),
    null,
  );
  assert.ok(
    researchDeadline(
      "2026-10-05T16:00:00Z",
      Date.parse("2026-10-05T19:20:00Z"),
    )?.includes("3 PM"),
  );
  assert.equal(
    researchDeadline(
      "2026-10-05T19:05:00Z",
      Date.parse("2026-10-05T19:20:00Z"),
    ),
    null,
  );
});

test("intermediate odds inserts do not hide a failed completed coverage run", () => {
  const now = Date.parse("2026-10-14T16:00:00Z");
  const alerts = feedAlerts(
    [
      {
        provider: "The Odds API",
        status: "partial",
        created_at: "2026-10-14T15:59:00Z",
        details: { books: ["FanDuel"], quoted_markets: 0 },
      },
      {
        provider: "The Odds API",
        status: "ok",
        created_at: "2026-10-14T16:00:00Z",
        details: { inserted: 0 },
      },
    ],
    now,
  );
  assert.equal(
    alerts.find((a) => a.provider === "The Odds API")?.reason,
    "partial",
  );
});
