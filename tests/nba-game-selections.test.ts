import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gameSelectionCards,
  loadGameSelections,
} from "../src/lib/nba-game-selections";
import {
  nbaEditorialOpen,
  type NbaEditorialPick,
} from "../src/lib/nba-editorial";
import type { NbaGame } from "../src/lib/nba-board";
const now = Date.parse("2026-11-10T18:00:00Z");
const game = {
  id: "g1",
  tipoff: "2026-11-10T20:00:00Z",
  tipoff_tbd: false,
  status: "STATUS_SCHEDULED",
} as NbaGame;
const pick = (id: string, extra: Partial<NbaEditorialPick> = {}) =>
  ({
    id,
    game_id: "g1",
    expires_at: "2026-11-10T20:00:00Z",
    supersedes_id: null,
    game,
    ...extra,
  }) as NbaEditorialPick;

test("membership denial or access failure never requests protected publications", async () => {
  let reads = 0;
  const page = async () => {
    reads++;
    return [pick("a")];
  };
  assert.deepEqual(await loadGameSelections("g1", async () => false, page), {
    status: "denied",
    picks: [],
  });
  assert.deepEqual(
    await loadGameSelections(
      "g1",
      async () => {
        throw new Error("access");
      },
      page,
    ),
    { status: "error", picks: [] },
  );
  assert.equal(reads, 0);
});
test("truthful empty differs from failed publication read and a partial failed history is discarded", async () => {
  assert.deepEqual(
    await loadGameSelections(
      "g1",
      async () => true,
      async () => [],
    ),
    { status: "ready", picks: [] },
  );
  assert.deepEqual(
    await loadGameSelections(
      "g1",
      async () => true,
      async (_id, offset) => {
        if (offset) throw new Error("page failed");
        return Array.from({ length: 200 }, (_, i) => pick(String(i)));
      },
    ),
    { status: "error", picks: [] },
  );
});
test("same-game selections and every revision page are loaded without an expiry filter", async () => {
  const offsets: number[] = [];
  const result = await loadGameSelections(
    "g1",
    async () => true,
    async (id, offset, size) => {
      assert.equal(id, "g1");
      assert.equal(size, 200);
      offsets.push(offset);
      return offset === 0
        ? Array.from({ length: 200 }, (_, i) => pick(String(i)))
        : [
            pick("revision", {
              supersedes_id: "0",
              expires_at: "2026-11-10T17:00:00Z",
            }),
            pick("other", { game_id: "g2" }),
          ];
    },
  );
  assert.equal(result.picks.length, 201);
  assert.deepEqual(offsets, [0, 200]);
  const cards = gameSelectionCards(result.picks, game);
  assert.equal(cards[0].superseded, true);
  assert.equal(
    nbaEditorialOpen(cards[0].pick, now, cards[0].superseded),
    false,
  );
  assert.equal(nbaEditorialOpen(cards[200].pick, now, false), false);
});
test("current schedule, exact expiry, live and final states preserve cards but prohibit pregame actions", () => {
  for (const updated of [
    game,
    { ...game, status: "STATUS_IN_PROGRESS" },
    { ...game, status: "STATUS_FINAL" },
    {
      ...game,
      status: "STATUS_SCHEDULED",
      tipoff: new Date(now).toISOString(),
    },
  ]) {
    const cards = gameSelectionCards(
      [pick("a"), pick("other", { game_id: "g2" })],
      updated,
    );
    assert.equal(cards.length, 1);
    assert.equal(nbaEditorialOpen(cards[0].pick, now, false), updated === game);
  }
  const expired = gameSelectionCards(
    [pick("a", { expires_at: new Date(now).toISOString() })],
    game,
  )[0];
  assert.equal(nbaEditorialOpen(expired.pick, now, false), false);
});
test("both game surfaces place the shared section before research; state is scoped and abortable", () => {
  for (const file of ["nba-home.tsx", "nba-game-detail.tsx"]) {
    const src = readFileSync(`src/components/${file}`, "utf8");
    assert.ok(
      src.indexOf("<NbaGameSelections") < src.indexOf("<NbaGameDetails"),
    );
  }
  const src = readFileSync("src/components/nba-game-selections.tsx", "utf8");
  assert.match(src, /snapshot\?\.gameId === game\.id/);
  assert.match(src, /snapshot\.epoch === epoch/);
  assert.match(src, /controller\.abort\(\)/);
  assert.match(src, /if \(live\) setSnapshot/);
  assert.match(src, /No VQ selections published for this game/);
  assert.match(src, /Published selections could not load/);
  assert.doesNotMatch(src, /\.gt\("expires_at"/);
});
