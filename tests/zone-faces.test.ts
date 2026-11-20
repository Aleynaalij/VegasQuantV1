import assert from "node:assert/strict";
import test from "node:test";
import { faceInitials, faceKey, findFaces } from "../src/lib/zone-faces";

test("faceKey drops accents, punctuation and suffixes", () => {
  assert.equal(faceKey("Luka Dončić"), "luka doncic");
  assert.equal(faceKey("Jaren Jackson Jr."), "jaren jackson");
  assert.equal(faceKey("Karl-Anthony Towns"), "karl anthony towns");
  assert.equal(faceKey("De'Aaron Fox"), "deaaron fox");
});

test("finds NBA players in a post, in order, with ESPN headshots", () => {
  const f = findFaces(
    "Karl-Anthony Towns Over 12.5 rebounds; Jalen Brunson under 26.5",
    "nba",
  );
  assert.deepEqual(
    f.map((x) => x.name),
    ["Karl-Anthony Towns", "Jalen Brunson"],
  );
  assert.equal(
    f[1].src,
    "https://a.espncdn.com/i/headshots/nba/players/full/3934672.png",
  );
});

test("NHL faces use NHL.com tricodes; a sport tag limits the pool", () => {
  const [mcdavid] = findFaces("Connor McDavid over 1.5 points", "nhl");
  assert.equal(
    mcdavid.src,
    "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png",
  );
  const [celebrini] = findFaces("Macklin Celebrini anytime goal", "nhl");
  assert.match(celebrini.src, /\/SJS\/8484801\.png$/);
  assert.deepEqual(findFaces("Connor McDavid over 1.5 points", "nba"), []);
});

test("untagged posts try every sport; unknown names, duplicates and the limit", () => {
  assert.equal(
    findFaces("Jalen Brunson and Connor McDavid", "general").length,
    2,
  );
  assert.deepEqual(findFaces("Some Random Guy had a night", null), []);
  assert.equal(
    findFaces("Jalen Brunson, Jalen Brunson again", "nba").length,
    1,
  );
  assert.equal(
    findFaces("Jalen Brunson Josh Hart Mikal Bridges OG Anunoby", "nba", 3)
      .length,
    3,
  );
  assert.equal(faceInitials("Karl-Anthony Towns"), "KT");
});
