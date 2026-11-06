import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGesture,
  dragDegrees,
  faceGames,
  parseSpinMode,
  ringRadius,
  settleStep,
  spinFaces,
  wrap,
} from "../src/lib/skybox-spin.ts";
import type { TonightGame } from "../src/lib/vq-tonight.ts";

const game = (sport: TonightGame["sport"], id: string, start: string): TonightGame => ({
  sport, id, away: "Away", home: "Home", start, tbd: false, status: null, href: `/${sport}/games/${id}`,
});

test("faces follow the turning order; NHL only when its access rule allows", () => {
  assert.deepEqual(spinFaces(true), ["nfl", "nba", "nhl", "ncaab"]);
  assert.deepEqual(spinFaces(false), ["nfl", "nba", "ncaab"]);
});

test("wrap keeps any position on the ring", () => {
  assert.equal(wrap(0, 4), 0);
  assert.equal(wrap(4, 4), 0);
  assert.equal(wrap(-1, 4), 3);
  assert.equal(wrap(-5, 4), 3);
  assert.equal(wrap(7, 3), 1);
});

test("a face shows only its sport, in the chronological order it was given", () => {
  const rows = [game("nba", "b", "2026-11-06T23:00:00Z"), game("nhl", "c", "2026-11-06T23:30:00Z"), game("nba", "d", "2026-11-07T01:00:00Z")];
  assert.deepEqual(faceGames(rows, "nba").map((g) => g.id), ["b", "d"]);
  assert.deepEqual(faceGames(rows, "ncaab"), []);
});

test("small movement is a tap; a clearly horizontal drag turns; diagonal-ish stays a scroll", () => {
  assert.equal(classifyGesture(4, 3), "pending");
  assert.equal(classifyGesture(-40, 6), "horizontal");
  assert.equal(classifyGesture(30, 28), "vertical");
  assert.equal(classifyGesture(2, 40), "vertical");
});

test("settling: quarter-width commits, short slow drags snap back, fast flicks commit and win reversals", () => {
  assert.equal(settleStep(-120, 0.05, 360), 1); // left drag past a quarter → next face
  assert.equal(settleStep(120, 0.05, 360), -1); // right → previous
  assert.equal(settleStep(-40, 0.1, 360), 0); // short and slow → stays
  assert.equal(settleStep(-30, -0.8, 360), 1); // quick flick left
  assert.equal(settleStep(-150, 0.9, 360), -1); // dragged left, flicked back right fast → previous
  assert.equal(settleStep(-150, 0.2, 360), 1); // slow drift back: distance decides
  assert.equal(settleStep(5, 2, 360), 0); // a twitch is never a turn
});

test("a live drag maps to degrees with resistance past one face", () => {
  assert.equal(dragDegrees(-180, 360, 4), -45);
  assert.ok(Math.abs(dragDegrees(-10000, 360, 4) + 103.5) < 1e-9);
  assert.equal(dragDegrees(0, 0, 4), 0);
});

test("ring radius closes the faces into a prism", () => {
  assert.ok(Math.abs(ringRadius(400, 4) - 200) < 1e-9);
  assert.ok(Math.abs(ringRadius(300, 3) - 300 / 2 / Math.tan(Math.PI / 3)) < 1e-9);
});

test("a stored face is trusted only when it is one of today's faces", () => {
  const faces = spinFaces(false);
  assert.equal(parseSpinMode("nba", faces), "nba");
  assert.equal(parseSpinMode("nhl", faces), "overview"); // NHL held: never restored into
  assert.equal(parseSpinMode("overview", faces), "overview");
  assert.equal(parseSpinMode("<script>", faces), "overview");
  assert.equal(parseSpinMode(null, faces), "overview");
});
