import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chartPlayers,
  blockChartPlayers,
  restDays,
  nhlChartRef,
} from "../src/lib/nhl-chart-package";
const samples = [
  {
    id: 1,
    name: "A",
    date: "2026-11-01",
    game_id: "1",
    position: "D",
    opponent: "OTT",
    shots: 0,
    goals: 0,
    points: 0,
    blocks: 1,
    seconds: 600,
    shifts: 10,
  },
  {
    id: 1,
    name: "A",
    date: "2026-11-02",
    game_id: "2",
    position: "D",
    opponent: "TOR",
    shots: 3,
    goals: 1,
    points: 2,
    blocks: 3,
    seconds: 1800,
    shifts: 30,
  },
];
test("blocks per60 uses total verified seconds and missing fields never become zeros", () => {
  const p = chartPlayers({ samples } as any, true)[0];
  assert.equal(p.blocksPer60, 6);
  assert.equal(p.shots, 3);
  const missing = chartPlayers({
    samples: [...samples, { ...samples[0], blocks: null, shots: null }],
  } as any)[0];
  assert.equal(missing.blocksPer60, null);
  assert.equal(missing.shots, null);
});
test("rest is calendar off days, not travel or elapsed recovery; NHL markers are isolated", () => {
  assert.equal(restDays("2026-11-03", "2026-11-02"), 0);
  assert.equal(restDays("2026-11-04", "2026-11-02"), 1);
  assert.equal(restDays("2026-11-04", undefined), null);
  assert.equal(nhlChartRef("vq-publication:v1"), null);
});
test("snapshot/source/Dealer publication path enforces immutable dedupe and postponed exclusion", () => {
  execFileSync(process.execPath, ["tests/sql/nhl-chart-package.mjs"], {
    timeout: 60000,
    stdio: "pipe",
  });
});

test("blocks chart excludes small exposure while retaining the full raw table", () => {
  const two = { samples } as any;
  assert.equal(blockChartPlayers(two).length, 0);
  assert.equal(
    blockChartPlayers({
      samples: [
        ...samples,
        { ...samples[1], date: "2026-11-03", game_id: "3" },
      ],
    } as any).length,
    1,
  );
  assert.equal(
    blockChartPlayers({
      samples: [
        ...samples,
        { ...samples[1], date: "2026-11-03", blocks: null },
      ],
    } as any).length,
    0,
  );
});
