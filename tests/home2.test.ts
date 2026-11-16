import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { homeResearch, homeTimestamp, HOME_TOOLS } from "../src/lib/home2";
import type { HubData } from "../src/lib/research-hub-reader";
const event = {
  key: "nba:g",
  id: "g",
  sport: "nba" as const,
  slug: "game",
  away: "A",
  home: "B",
  start: "2026-11-16T23:00:00Z",
  tbd: false,
  venue: null,
  status: "scheduled",
  source: null,
  scheduleAt: null,
};
const finding = {
  id: "f",
  eventKey: event.key,
  topic: "context" as const,
  title: "Observed",
  text: "Evidence",
  sources: [],
  sourceAt: null,
  recordedAt: "2026-11-16T10:00:00Z",
  label: "Provider report" as const,
};
const data: HubData = {
  events: [event],
  findings: [finding],
  errors: [],
  denied: false,
  signedIn: true,
  truncated: false,
};
test("Home never exposes protected findings while denied or signed out", () => {
  assert.deepEqual(homeResearch({ ...data, denied: true }, "all"), []);
  assert.deepEqual(homeResearch({ ...data, signedIn: false }, "all"), []);
  assert.deepEqual(homeResearch(null, "all"), []);
});
test("Home research matches stable event keys and selected sport", () => {
  assert.equal(homeResearch(data, "nba").length, 1);
  assert.equal(homeResearch(data, "nfl").length, 0);
  assert.equal(homeResearch({ ...data, events: [] }, "all").length, 0);
});
test("Home latest evidence sorts recorded timestamps without inventing source freshness", () => {
  const rows = homeResearch(
    {
      ...data,
      findings: [
        finding,
        { ...finding, id: "new", recordedAt: "2026-11-16T12:00:00Z" },
        { ...finding, id: "unknown", recordedAt: null },
      ],
    },
    "all",
    2,
  );
  assert.deepEqual(
    rows.map((r) => r.finding.id),
    ["new", "f"],
  );
  assert.equal(homeTimestamp(null), "Time not supplied");
  assert.equal(homeTimestamp("invalid"), "Time not supplied");
});
test("Home preserves account collection, builder and Fear destinations", () => {
  for (const href of ["/saved", "/parlays", "/parlays?build=1", "/vegas-fear"])
    assert.ok(HOME_TOOLS.some((t) => t.href === href));
});

test("Home account access reuses the existing authenticated profile destination", () => {
  const source = readFileSync("src/components/home2/home2.tsx", "utf8");
  assert.match(source, /<AccountLink \/>/);
  assert.doesNotMatch(source, /href="\/account"/);
});
