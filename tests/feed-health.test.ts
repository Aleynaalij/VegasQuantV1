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
        attempted_at: new Date(fetched).toISOString(),
        fetched_at: new Date(fetched).toISOString(),
        event_fetch_state_version: 2,
        event_fetched_at: { event_1: new Date(fetched).toISOString() },
      },
    }),
    clock,
    30 * 60000,
  );
  assert.equal(r.state, "not_due");
  assert.equal(r.timeState, "current");
  assert.equal(r.attemptedAt, fetched);
  assert.deepEqual(r.eventFetchedAt, { event_1: fetched });
  assert.equal(
    feedRunHealth(healthRow("ok"), clock, 30 * 60000).attemptedAt,
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
        healthRow("ok", { details: { attempted_at: value } }),
        clock,
        1,
      ).attemptedAt,
      null,
    );
});

// Match source-sync's writer payloads: failed attempts advance batch clocks, not event successes.
const propsRun = (status: string, details: Record<string, unknown>) =>
  healthRow(status, { provider: "The Odds API props", details });
const at = (n: number) => new Date(n).toISOString();
test("NFL props failed writer payload keeps the attempt distinct from prior event success", () => {
  const prior = clock - 2 * 3600000;
  const r = feedRunHealth(propsRun("error", {
    message: "Prop provider unavailable; prior observations retained",
    event_fetch_state_version: 2, event_fetched_at: { e0: at(prior) },
    event_attempted_at: { e0: at(prior) }, attempted_at: at(clock), fetched_at: at(clock),
  }), clock, 1800000);
  assert.equal(r.state, "failed");assert.equal(r.attemptedAt, clock);
  assert.deepEqual(r.eventFetchedAt, { e0: prior });
});
test("NFL props partial writer payload preserves each successful event and deferred evidence", () => {
  const prior = clock - 3600000;
  const r = feedRunHealth(propsRun("partial", {
    events: 2, eligible_events: 3, deferred_events: 1, attempted_events: 2, fetched_events: 1,
    failed: 1, empty: 0, skipped: 0, inserted_quotes: 4, event_fetch_state_version: 2,
    event_fetched_at: { success: at(clock), deferred: at(prior) },
    event_attempted_at: { success: at(clock), failed: at(clock), deferred: at(prior) },
    attempted_at: at(clock), fetched_at: at(clock),
  }), clock, 1800000);
  assert.equal(r.state, "partial");assert.equal(r.attemptedAt, clock);
  assert.deepEqual(r.eventFetchedAt, { success: clock, deferred: prior });
  assert.equal("failed" in r.eventFetchedAt, false);
});
test("NFL props carried-forward, legacy and invalid evidence never invent new successes", () => {
  const prior = clock - 3600000;
  const details = { carried_forward: true, event_fetch_state_version: 2,
    event_fetched_at: { e0: at(prior), invalid: "bad", future: at(clock + 1) },
    event_attempted_at: { e0: at(prior) }, fetched_at: at(prior), attempted_at: at(prior) };
  const r=feedRunHealth(propsRun("ok",details),clock,1800000);
  assert.equal(r.state,"not_due");assert.equal(r.runAt,clock);assert.equal(r.attemptedAt,prior);
  assert.deepEqual(r.eventFetchedAt,{e0:prior});
  const legacy=feedRunHealth(propsRun("error",{fetched_at:at(clock),event_fetched_at:{e0:at(clock)}}),clock,1800000);
  assert.equal(legacy.attemptedAt,clock);assert.deepEqual(legacy.eventFetchedAt,{});
});
