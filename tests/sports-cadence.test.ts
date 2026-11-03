import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_CAP,
  etDayEnd,
  linesInterval,
  MAX_INTERVAL,
  MIN_INTERVAL,
  reservedToday,
} from "../supabase/functions/sports-sync/cadence";

const H = 3600000;
const at = (iso: string) => Date.parse(iso);
const game = (id: string, start: number) => ({ id, start_time: new Date(start).toISOString() });

test("ET day end follows New York midnight in both DST seasons", () => {
  assert.equal(new Date(etDayEnd(at("2026-11-02T10:00:00Z"))).toISOString(), "2026-11-03T05:00:00.000Z"); // EST
  assert.equal(new Date(etDayEnd(at("2026-07-01T10:00:00Z"))).toISOString(), "2026-07-02T04:00:00.000Z"); // EDT
  assert.equal(new Date(etDayEnd(at("2026-11-03T04:30:00Z"))).toISOString(), "2026-11-03T05:00:00.000Z"); // 11:30 PM ET
});

test("reserved credits reset with the ET day", () => {
  const now = at("2026-11-02T15:00:00Z"); // 10 AM ET Nov 2
  assert.equal(reservedToday({ credit_day: "2026-11-02", daily_reserved: 30 }, now), 30);
  assert.equal(reservedToday({ credit_day: "2026-11-01", daily_reserved: 50 }, now), 0);
  assert.equal(reservedToday({ credit_day: null, daily_reserved: null }, now), 0);
});

test("unpriced games never speed refreshes up; no priced game today keeps discovery cadence", () => {
  const now = at("2026-11-02T05:00:00Z");
  const games = [game("a", now + H), game("b", now + 2 * H)];
  assert.equal(linesInterval({ now, games, priced: new Set(), cap: 50, reserved: 0 }), MAX_INTERVAL);
  // Priced, but tomorrow: still discovery cadence.
  assert.equal(linesInterval({ now, games: [game("c", now + 30 * H)], priced: new Set(["c"]), cap: 50, reserved: 0 }), MAX_INTERVAL);
});

test("remaining refreshes spread to the last priced tip, clamped to 25 min .. 3 h", () => {
  const now = at("2026-11-02T15:00:00Z"); // 10 AM ET
  const last = at("2026-11-03T03:00:00Z"); // 10 PM ET
  const games = [game("x", last)];
  // 50 credits, cost 2 -> 25 refreshes, keep one in hand -> 24 over 12 h = 30 min.
  assert.equal(linesInterval({ now, games, priced: new Set(["x"]), cap: 50, reserved: 0 }), 30 * 60000);
  // Plenty left (NHL budget) -> floor of 25 min.
  assert.equal(linesInterval({ now, games, priced: new Set(["x"]), cap: 150, reserved: 0 }), MIN_INTERVAL);
  // Nearly spent -> slows to the 3 h ceiling instead of exhausting.
  assert.equal(linesInterval({ now, games, priced: new Set(["x"]), cap: 50, reserved: 44 }), MAX_INTERVAL);
  assert.equal(linesInterval({ now, games, priced: new Set(["x"]), cap: 50, reserved: 50 }), MAX_INTERVAL);
});

// Replay Nov 2's real college slate through the sync's 2-minute ticks, old rule versus new.
const { rows } = JSON.parse(readFileSync("tests/fixtures/sports/ncaab/2026-11-02-tips.json", "utf8")) as { rows: [string, number, number][] };
const slate: { id: string; start_time: string }[] = [];
const priced = new Set<string>();
rows.forEach(([t, p, u], i) => {
  for (let k = 0; k < p + u; k++) {
    const id = `${i}-${k}`;
    slate.push({ id, start_time: t });
    if (k < p) priced.add(id);
  }
});
function replay(rule: "old" | "new") {
  const dayStart = at("2026-11-02T05:00:00Z"); // 00:00 ET (EST)
  let reserved = 0, last: number | null = null;
  const refreshes: number[] = [];
  for (let now = dayStart; now < dayStart + 24 * H; now += 2 * 60000) {
    const upcoming = slate.filter((g) => Date.parse(g.start_time) > now);
    if (!upcoming.length) continue;
    const interval = rule === "old"
      ? (upcoming.some((g) => Date.parse(g.start_time) <= now + 6 * H) ? 25 * 60000 : 3 * H)
      : linesInterval({ now, games: upcoming, priced, cap: DAILY_CAP.ncaab, reserved });
    if (last !== null && now - last < interval) continue;
    if (reserved + 2 > DAILY_CAP.ncaab) continue; // sports_reserve_credits refuses
    reserved += 2; last = now; refreshes.push(now);
  }
  return { reserved, refreshes };
}

test("Nov 2 replay: the old rule ran dry by early afternoon; the new one prices the evening slate", () => {
  const old = replay("old");
  assert.equal(old.reserved, 50);
  assert.ok(old.refreshes.at(-1)! < at("2026-11-02T18:00:00Z"), "old rule's last refresh is before 1 PM ET");

  const fresh = replay("new");
  assert.ok(fresh.reserved <= 50);
  // A refresh inside the hour before the 7 PM ET wave (53 games at 00:00Z) and before 10 PM ET.
  assert.ok(fresh.refreshes.some((t) => t >= at("2026-11-02T23:00:00Z") && t < at("2026-11-03T00:00:00Z")), "refresh in the hour before 7 PM ET");
  assert.ok(fresh.refreshes.some((t) => t >= at("2026-11-03T02:00:00Z") && t < at("2026-11-03T03:00:00Z")), "refresh in the hour before 10 PM ET");
  // No refresh is ever closer than 25 minutes to the previous one.
  for (let i = 1; i < fresh.refreshes.length; i++) assert.ok(fresh.refreshes[i] - fresh.refreshes[i - 1] >= MIN_INTERVAL);
});
