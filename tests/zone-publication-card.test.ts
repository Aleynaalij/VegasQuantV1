import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  AUTOMATED_CARD,
  isPublicationCard,
  publicationCopy,
  publicationPages,
  PUBLICATION_COLORS,
  wrapCardText,
} from "../src/lib/zone-publication-card";
const post = {
  id: "fixture",
  sport: "nba",
  title: "Stored selection",
  body:
    "Original text.\n\nRisk: uncertain.\n\nhttps://example.com/" +
    "W".repeat(1200),
  legs: ["Player Over 6.5 rebounds (+124)"],
  created_at: "2026-10-31T16:00:00Z",
  card: AUTOMATED_CARD,
};
test("automated cards keep all content across bounded pages and copy only explicit legs", () => {
  assert.equal(isPublicationCard(post), true);
  assert.equal(isPublicationCard({ ...post, card: null }), false);
  assert.equal(isPublicationCard({ ...post, sport: "fake" }), false);
  const pages = publicationPages(post);
  assert.ok(pages.length > 1);
  assert.equal(
    pages
      .flatMap((p) => p.lines)
      .join("")
      .replace(/\s/g, ""),
    [...post.legs, post.body].join("").replace(/\s/g, ""),
  );
  assert.ok(pages.every((p) => p.start + (p.lines.length - 1) * 42 < 1180));
  assert.equal(publicationCopy(post), post.title + "\n" + post.legs[0]);
  assert.equal(publicationCopy({ ...post, legs: [] }), "");
  assert.ok(wrapCardText("W".repeat(100), 32).every((l) => l.length <= 29));
  assert.equal(
    new Set(Object.values(PUBLICATION_COLORS).map((c) => c.accent)).size,
    4,
  );
});
test("automation markers and legs are attached only by verified server paths", () => {
  const r = spawnSync(
    process.execPath,
    ["tests/sql/zone-automated-cards.mjs"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});
