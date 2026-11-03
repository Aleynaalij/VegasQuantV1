import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_CAP,
  etDayEnd,
  latestPriced,
  linesInterval,
  pricedForPacing,
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

test("latest priced game: probes tip slots from the last one back, one row each, and stops at the first hit", async () => {
  const t = (h: number) => new Date(at("2026-11-02T20:00:00Z") + h * H).toISOString();
  // 250 unpriced games at the latest slot (split into 3 probes), then one priced game, then earlier ones.
  const late = Array.from({ length: 250 }, (_, i) => ({ id: `late-${i}`, start_time: t(4) }));
  const games = [{ id: "early", start_time: t(0) }, { id: "mid-priced", start_time: t(2) }, ...late, { id: "mid-other", start_time: t(2) }];
  const marketed = new Set(["early", "mid-priced"]);
  const calls: string[][] = [];
  const probe = async (ids: string[]) => { calls.push(ids); return ids.find((id) => marketed.has(id)) ?? null; };
  const hit = await latestPriced(games, probe);
  assert.deepEqual([...hit], ["mid-priced"]);
  assert.deepEqual(calls.map((c) => c.length), [100, 100, 50, 2]); // latest slot in chunks, then the 2-game slot; never the early slot
  assert.ok(calls.every((c) => c.length <= 100));
});

test("latest priced game: none priced today gives an empty set (discovery cadence)", async () => {
  const games = [game("a", at("2026-11-02T20:00:00Z")), game("b", at("2026-11-02T22:00:00Z"))];
  const hit = await latestPriced(games, async () => null);
  assert.equal(hit.size, 0);
  assert.equal(linesInterval({ now: at("2026-11-02T15:00:00Z"), games, priced: hit, cap: 50, reserved: 0 }), MAX_INTERVAL);
});

// ---- C-B acceptance cases ----

test("caps mirror sports_reserve_credits exactly (150 NHL, 50 college)", () => {
  const sql = readFileSync("supabase/migrations/20261031145407_multisport_backend.sql", "utf8");
  const m = /p_sport='nhl' then (\d+) else (\d+) end/.exec(sql);
  assert.ok(m, "reservation cap expression found");
  assert.deepEqual({ nhl: Number(m![1]), ncaab: Number(m![2]) }, DAILY_CAP);
});

test("empty or stale market reads give discovery cadence, never a fast one", async () => {
  const now = at("2026-11-02T15:00:00Z");
  const games = [game("a", now + 4 * H), game("b", now + 8 * H)];
  // Empty read (no markets at all) and stale read (the probe's 36 h window excludes old rows) both return null.
  const { priced, error } = await pricedForPacing(games, async () => null);
  assert.equal(error, null);
  assert.equal(linesInterval({ now, games, priced, cap: 50, reserved: 0 }), MAX_INTERVAL);
});

test("a failed market read never blocks lines: pacing falls back to every game today, inside the budget", async () => {
  const now = at("2026-11-02T15:00:00Z");
  const games = [game("a", now + 2 * H), game("b", now + 12 * H)];
  const { priced, error } = await pricedForPacing(games, async () => { throw new Error("statement timeout"); });
  assert.match(error!, /statement timeout/);
  assert.equal(priced.size, 2);
  // 50 credits, 24 usable refreshes over 12 h = 30 min: paced, not 25-min burn, not blocked.
  assert.equal(linesInterval({ now, games, priced, cap: 50, reserved: 0 }), 30 * 60000);
});

test("zero or one refresh left: slow to the ceiling rather than spend the last credits early", () => {
  const now = at("2026-11-02T15:00:00Z");
  const games = [game("x", now + 10 * H)];
  const priced = new Set(["x"]);
  // 4 credits left -> 2 refreshes -> 1 after the one kept in hand: 10 h / 1, clamped to 3 h.
  assert.equal(linesInterval({ now, games, priced, cap: 50, reserved: 46 }), MAX_INTERVAL);
  // 2 credits left -> 1 refresh -> 0 usable (kept in hand) -> ceiling.
  assert.equal(linesInterval({ now, games, priced, cap: 50, reserved: 48 }), MAX_INTERVAL);
  // Over-reserved (failed paid requests still consume reservations) never goes negative.
  assert.equal(linesInterval({ now, games, priced, cap: 50, reserved: 60 }), MAX_INTERVAL);
});

test("ET reset and DST: day end and reservation day follow New York on both switch days", () => {
  // DST ends Sun 2026-11-01 (25-hour day); begins Sun 2026-03-08 (23-hour day).
  assert.equal(new Date(etDayEnd(at("2026-11-01T12:00:00Z"))).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(new Date(etDayEnd(at("2026-03-08T12:00:00Z"))).toISOString(), "2026-03-09T04:00:00.000Z");
  // 11:30 PM ET on Nov 2 is still Nov 2's budget; 12:30 AM ET Nov 3 starts fresh.
  assert.equal(reservedToday({ credit_day: "2026-11-02", daily_reserved: 40 }, at("2026-11-03T04:30:00Z")), 40);
  assert.equal(reservedToday({ credit_day: "2026-11-02", daily_reserved: 40 }, at("2026-11-03T05:30:00Z")), 0);
});

test("a game priced later in the day pulls the pace in as soon as it is seen", async () => {
  const now = at("2026-11-02T15:00:00Z");
  const games = [game("early", now + 2 * H), game("late", now + 12 * H)];
  let marketed = new Set(["early"]);
  const probe = async (ids: string[]) => ids.find((id) => marketed.has(id)) ?? null;
  const before = linesInterval({ now, games, priced: (await pricedForPacing(games, probe)).priced, cap: 50, reserved: 0 });
  assert.equal(before, MIN_INTERVAL); // only a near game priced: 2 h / 24 -> floor
  marketed = new Set(["early", "late"]);
  const after = linesInterval({ now, games, priced: (await pricedForPacing(games, probe)).priced, cap: 50, reserved: 0 });
  assert.equal(after, 30 * 60000); // now paced to the 12 h horizon
});

test("refreshes never exceed the cap however the clock runs", () => {
  const start = at("2026-11-02T05:00:00Z");
  const games = Array.from({ length: 40 }, (_, i) => game(String(i), start + (i + 1) * 0.5 * H));
  const priced = new Set(games.map((g) => g.id));
  let reserved = 0, last: number | null = null, refreshes = 0;
  for (let now = start; now < start + 24 * H; now += 60000) {
    const iv = linesInterval({ now, games, priced, cap: 50, reserved });
    if (last !== null && now - last < iv) continue;
    if (reserved + 2 > 50) continue;
    reserved += 2; last = now; refreshes++;
  }
  assert.ok(refreshes <= 25 && reserved <= 50);
});
