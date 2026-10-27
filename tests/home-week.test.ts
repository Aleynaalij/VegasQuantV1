import test from "node:test";
import assert from "node:assert/strict";
import { homeWeekStart, isCurrentHomeWeek } from "../src/lib/home-week";
test("Home rolls over at Tuesday noon Eastern, preserving Monday night", () => {
 assert.equal(homeWeekStart(new Date("2026-10-13T15:59:59Z")), "2026-10-06T16:00:00.000Z");
 assert.equal(homeWeekStart(new Date("2026-10-13T16:00:00Z")), "2026-10-13T16:00:00.000Z");
 assert.equal(isCurrentHomeWeek("2026-10-11T01:40:33Z", new Date("2026-10-13T16:00:00Z")), false);
 assert.equal(isCurrentHomeWeek("2026-10-15T00:00:00Z", new Date("2026-10-13T16:00:00Z")), true);
 assert.equal(isCurrentHomeWeek(undefined), false);
});
test("Home cutoff uses the Eastern offset of the cutoff, including DST changes", () => {
 assert.equal(homeWeekStart(new Date("2026-11-02T20:00:00Z")), "2026-10-27T16:00:00.000Z");
 assert.equal(homeWeekStart(new Date("2026-11-03T17:00:00Z")), "2026-11-03T17:00:00.000Z");
});
