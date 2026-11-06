import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedAlerts,
  feedRunHealth,
  researchDeadline,
} from "../src/lib/feed-health";
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
  assert.equal(alerts.length, 6);
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

const clock = Date.parse("2026-11-05T18:00:00Z");
const healthRow = (status: string, extra = {}) => ({
  provider: "synthetic",
  status,
  created_at: new Date(clock).toISOString(),
  ...extra,
});
test("job outcome and elapsed freshness stay independent; old failures do not become merely stale", () => {
  for (const [status, state] of [
    ["ok", "ok"],
    ["error", "failed"],
    ["failed", "failed"],
    ["partial", "partial"],
    ["skipped", "skipped"],
    ["not due", "not_due"],
    ["no upcoming events", "no_events"],
    ["not configured", "unknown"],
  ]) {
    const r = feedRunHealth(healthRow(status), clock + 31 * 60000, 30 * 60000);
    assert.equal(r.state, state);
    assert.equal(r.timeState, "stale");
  }
  const alert = feedAlerts(
    [healthRow("error", { provider: "ESPN" })],
    clock + 31 * 60000,
  ).find((a) => a.provider === "ESPN");
  assert.equal(alert?.reason, "error; refresh older than 30 minutes");
});
test("carried-forward checks never advance retrieval evidence or establish quote freshness", () => {
  const fetched = clock - 2 * 3600000;
  const r = feedRunHealth(
    healthRow("ok", {
      details: {
        carried_forward: true,
        fetched_at: new Date(fetched).toISOString(),
      },
    }),
    clock,
    30 * 60000,
  );
  assert.equal(r.state, "not_due");
  assert.equal(r.timeState, "current");
  assert.equal(r.fetchedAt, fetched);
  assert.equal(
    feedRunHealth(healthRow("ok"), clock, 30 * 60000).fetchedAt,
    null,
  );
});
test("missing, invalid, future and boundary run clocks cannot be silently made current", () => {
  assert.equal(feedRunHealth(undefined, clock, 1).timeState, "missing");
  assert.equal(
    feedRunHealth(healthRow("ok", { created_at: "bad" }), clock, 1).timeState,
    "invalid",
  );
  assert.equal(
    feedRunHealth(healthRow("ok"), clock - 1, 1).timeState,
    "future",
  );
  assert.equal(
    feedRunHealth(healthRow("ok"), clock + 30 * 60000, 30 * 60000).timeState,
    "current",
  );
  assert.equal(feedRunHealth(healthRow("ok"), clock, NaN).timeState, "invalid");
  for (const value of ["bad", new Date(clock + 1).toISOString()])
    assert.equal(
      feedRunHealth(
        healthRow("ok", { details: { fetched_at: value } }),
        clock,
        1,
      ).fetchedAt,
      null,
    );
});
