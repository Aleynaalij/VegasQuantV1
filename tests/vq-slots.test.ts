import test from "node:test";
import assert from "node:assert/strict";
import {
  spinTicket,
  slotPool,
  ticketKey,
  slotCopy,
  type SlotLeg,
} from "../src/lib/vq-slots";
const now = Date.parse("2026-10-27T12:00:00Z");
const rows: SlotLeg[] = Array.from({ length: 12 }, (_, i) => ({
  leg_key: `leg-${i}`,
  name: `Player ${i}`,
  market: "50+ receiving yards",
  matchup: "VQA @ VQB",
  game_id: "game",
  expires_at: "2026-10-28T12:00:00Z",
  published_at: "2026-10-27T10:00:00Z",
  kind: "RESEARCH",
  result: null,
  copy_text: null,
}));
test("eight distinct legs and no immediate repeated ticket", () => {
  let seed = 12;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const a = spinTicket(rows, null, rng, now),
    b = spinTicket(rows, ticketKey(a), rng, now);
  assert.equal(a.length, 8);
  assert.equal(new Set(a.map((r) => r.name)).size, 8);
  assert.notEqual(ticketKey(a), ticketKey(b));
});
test("expired, settled, unsupported, missing-game and duplicates excluded", () => {
  assert.equal(
    slotPool(
      [
        ...rows,
        rows[0],
        { ...rows[0], expires_at: "2020-01-01" },
        { ...rows[0], kind: "WATCH" },
        { ...rows[0], result: "WIN" },
        { ...rows[0], game_id: null },
      ],
      now,
    ).length,
    12,
  );
});
test("never fills missing legs or repeats only available combination", () => {
  assert.throws(() => spinTicket(rows.slice(0, 7), null, Math.random, now));
  const eight = rows.slice(0, 8);
  assert.throws(() => spinTicket(eight, ticketKey(eight), Math.random, now));
});
test("same player alternative thresholds cannot occupy two reels", () => {
  assert.throws(() =>
    spinTicket(
      [
        ...rows.slice(0, 7),
        { ...rows[0], leg_key: "alternate", market: "80+ receiving yards" },
      ],
      null,
      Math.random,
      now,
    ),
  );
});
test("copy identifies random entertainment without invented odds", () => {
  assert.match(slotCopy(rows.slice(0, 8)), /not an analyst recommendation/);
  assert.match(slotCopy(rows.slice(0, 8)), /No combined odds/);
});
test("an official pick and a research target for one player count as one player", () => {
  // Seven research players plus an official "Player Prop" for Player 0: only seven players.
  const official: SlotLeg = {
    ...rows[0],
    leg_key: "official-0",
    name: "Player 0 80+ receiving yards",
    market: "Player Prop",
    kind: "OFFICIAL",
  };
  assert.throws(
    () => spinTicket([...rows.slice(0, 7), official], null, Math.random, now),
    /Eight different eligible selections/,
  );
  const ticket = spinTicket([...rows, official], null, Math.random, now);
  const players = ticket.map((r) => r.name.replace(/ \d+\+.*$/, ""));
  assert.equal(new Set(players).size, 8);
});
