import test from "node:test";
import assert from "node:assert/strict";
import { rankCappers } from "../src/lib/ruby";

const r = (
  brand: string,
  wins: number,
  losses: number,
  voids = 0,
  total = wins + losses + voids,
) => ({
  brand,
  wins,
  losses,
  voids,
  total,
});

test("cappers rank by wins, then fewer losses", () => {
  assert.deepEqual(
    rankCappers([r("B", 4, 2), r("A", 9, 3), r("C", 4, 1)]).map((x) => [
      x.brand,
      x.rank,
    ]),
    [
      ["A", 1],
      ["C", 2],
      ["B", 3],
    ],
  );
});

test("identical records share a rank and the next rank skips", () => {
  assert.deepEqual(
    rankCappers([
      r("Zed", 2, 1),
      r("Amy", 2, 1),
      r("Top", 5, 0),
      r("Low", 0, 4),
    ]).map((x) => [x.brand, x.rank]),
    [
      ["Top", 1],
      ["Amy", 2],
      ["Zed", 2],
      ["Low", 4],
    ],
  );
});

test("pending counts the slips not yet settled", () => {
  assert.equal(rankCappers([r("A", 3, 1, 1, 7)])[0].pending, 2);
});
