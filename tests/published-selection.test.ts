import test from "node:test";
import assert from "node:assert/strict";
import {
  publishedSelectionPath,
  readPublishedSelection,
} from "../src/lib/published-selection";

const candidate = "candidate:11111111-1111-4111-8111-111111111111:2";
const official = "official:22222222-2222-4222-8222-222222222222";
test("Tailed destinations preserve exact candidate ordinal and official identity", () => {
  for (const key of [candidate, official]) {
    const url = new URL(
      publishedSelectionPath(key),
      "https://vegasquant.invalid",
    );
    assert.equal(url.pathname, "/feed");
    assert.equal(url.searchParams.get("view"), "selection");
    assert.equal(url.searchParams.get("leg"), key);
    assert.equal(url.searchParams.has("release"), false);
  }
});
test("an exact authorized publication is returned; inaccessible publication stays empty", async () => {
  const row = { leg_key: candidate, name: "Second candidate" };
  assert.deepEqual(
    await readPublishedSelection(candidate, async () => ({
      data: [row],
      error: null,
    })),
    [row],
  );
  assert.deepEqual(
    await readPublishedSelection(candidate, async () => ({
      data: [],
      error: null,
    })),
    [],
  );
});
test("wrong publication, duplicate identity and failed reads cannot masquerade as the target", async () => {
  for (const data of [
    [{ leg_key: official }],
    [{ leg_key: candidate }, { leg_key: candidate }],
  ])
    await assert.rejects(
      readPublishedSelection(candidate, async () => ({ data, error: null })),
      /identity/,
    );
  await assert.rejects(
    readPublishedSelection(candidate, async () => ({
      data: null,
      error: Error("offline"),
    })),
    /could not load/,
  );
});
test("hung exact lookups abort within the bound and a fresh read can recover", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    readPublishedSelection(
      candidate,
      (s) => {
        signal = s;
        return new Promise(() => {});
      },
      5,
    ),
    /timed out/,
  );
  assert.equal(signal?.aborted, true);
  assert.equal(
    (
      await readPublishedSelection(candidate, async () => ({
        data: [{ leg_key: candidate }],
        error: null,
      }))
    )[0].leg_key,
    candidate,
  );
});
test("malformed or absent identities do not query a generic list", async () => {
  for (const key of ["", "a".repeat(513), "bad\nkey"]) {
    let reads = 0;
    assert.deepEqual(
      await readPublishedSelection(key, async () => {
        reads++;
        return { data: [], error: null };
      }),
      [],
    );
    assert.equal(reads, 0);
  }
});

test("exact ticket leaves come from the authorized release and immutable one-based index", async () => {
  const { readPublishedTicketLegs } = await import(
    "../src/lib/published-selection"
  );
  const id = "11111111-1111-4111-8111-111111111111";
  const identity = {
    leg_key: `candidate:${id}:2`,
    kind: "PARLAY",
    release_id: id,
    leg_index: 2,
  };
  const release = {
    id,
    candidates: [
      { parlay: true, parlay_legs: [{ name: "Wrong pick", market: "1+" }] },
      {
        parlay: true,
        copy_text: "Only a bundle title",
        parlay_legs: [
          { name: "First player", market: "40+ yards" },
          { name: "Second player", market: "3+ receptions" },
        ],
      },
    ],
  };
  const read = async () => ({ data: [release], error: null });
  const legs = await readPublishedTicketLegs(identity, read);
  assert.deepEqual(
    legs.map((leg) => leg.name),
    ["First player", "Second player"],
  );
  await assert.rejects(
    readPublishedTicketLegs({ ...identity, leg_index: 1 }, read),
    /identity/,
  );
  await assert.rejects(
    readPublishedTicketLegs(identity, async () => ({
      data: [{ ...release, id: "other" }],
      error: null,
    })),
    /identity/,
  );
  await assert.rejects(
    readPublishedTicketLegs(identity, async () => ({ data: [], error: null })),
    /unavailable/,
  );
});
test("Hail Mary preserves its original moneyline teams, and missing leaves are never reconstructed", async () => {
  const { readPublishedTicketLegs } = await import(
    "../src/lib/published-selection"
  );
  const id = "11111111-1111-4111-8111-111111111111";
  const identity = {
    leg_key: `candidate:${id}:1`,
    kind: "HAIL_MARY",
    release_id: id,
    leg_index: 1,
  };
  const read = async () => ({
    data: [
      {
        id,
        candidates: [
          { fun_play: true, legs: [{ team: "Seattle" }, { team: "Houston" }] },
        ],
      },
    ],
    error: null,
  });
  assert.deepEqual(
    (await readPublishedTicketLegs(identity, read)).map((leg) => [
      leg.name,
      leg.market,
    ]),
    [
      ["Seattle", "Moneyline"],
      ["Houston", "Moneyline"],
    ],
  );
  await assert.rejects(
    readPublishedTicketLegs(identity, async () => ({
      data: [
        { id, candidates: [{ fun_play: true, copy_text: "Seattle Houston" }] },
      ],
      error: null,
    })),
    /unavailable/,
  );
});
test("stalled session lookup has a deadline and can retry", async () => {
  const { readPublicationSession } = await import(
    "../src/lib/published-selection"
  );
  await assert.rejects(
    readPublicationSession(() => new Promise(() => {}), 5),
    /Session read timed out/,
  );
  assert.equal(
    await readPublicationSession(async () => "confirmed"),
    "confirmed",
  );
});

test("ticket outbound action copies every actual leaf and matches leaf identities, never a bundle key", async () => {
  const { publishedTicketAction } = await import(
    "../src/lib/published-selection"
  );
  const legs = [
    {
      name: "First player",
      market: "Full game · 40+ yards",
      matchup: "",
      why: "",
      risk: "",
    },
    {
      name: "Second player",
      market: "3+ receptions",
      matchup: "",
      why: "",
      risk: "",
    },
  ];
  assert.deepEqual(publishedTicketAction(legs), {
    selection: "First player 40+ yards\nSecond player 3+ receptions",
    kalshiTexts: ["First player 40+ yards", "Second player 3+ receptions"],
  });
  const keyed = publishedTicketAction(
    legs.map((leg, i) => ({ ...leg, leg_key: `leaf-${i}` })),
  );
  assert.ok("kalshiLegKeys" in keyed);
  assert.deepEqual(keyed.kalshiLegKeys, ["leaf-0", "leaf-1"]);
});
