import test from "node:test";
import assert from "node:assert/strict";
import { homeGameFrom, homeGamePath } from "../src/lib/journey.ts";

const slugs = ["sample-sea-den-2026-10-15", "sample-hou-jax-2026-10-18"];

test("research links back to the game's row on Home", () => {
  assert.equal(homeGamePath("sample-sea-den-2026-10-15"), "/?game=sample-sea-den-2026-10-15#home-games");
});

test("a malformed slug never builds a game URL", () => {
  for (const bad of ["", "../x", "a b", "A-B", "x?y=1", "-lead", "a".repeat(121)])
    assert.equal(homeGamePath(bad), "/#home-games", bad);
});

test("Home opens only a listed game", () => {
  assert.equal(homeGameFrom("?game=sample-hou-jax-2026-10-18", slugs), "sample-hou-jax-2026-10-18");
  assert.equal(homeGameFrom("?game=sample-old-2026-09-01", slugs), null);
  assert.equal(homeGameFrom("?game=", slugs), null);
  assert.equal(homeGameFrom("", slugs), null);
  assert.equal(homeGameFrom("?game=%2e%2e%2fadmin", slugs), null);
});

test("other query parameters are left alone", () => {
  assert.equal(homeGameFrom("?utm=x&game=sample-sea-den-2026-10-15", slugs), "sample-sea-den-2026-10-15");
});
