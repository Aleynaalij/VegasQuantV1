import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("src/components/ui.tsx", "utf8");
const lobby = readFileSync("src/components/vq-lobby.tsx", "utf8");

test("neither nav links to VQ Slots any more; /slots stays reachable by direct link", () => {
  assert.doesNotMatch(ui, /VQ Slots<\/|href=\{feed\}|vq-slots-nav-icon/);
  assert.match(readFileSync("src/app/slots/page.tsx", "utf8"), /<VqSlots \/>/);
});

test("The Zone tab glows in both the sidebar and the phone nav", () => {
  assert.equal(
    ui.match(
      /className=\{`vq-zone-nav \$\{active === "community" \? "active" : ""\}`\}/g,
    )?.length,
    2,
  );
  assert.equal(ui.match(/className="vq-zone-nav-icon"/g)?.length, 2);
  assert.match(ui, /import "@\/app\/zone-focus\.css";/);
});

test("Home leads with the glowing Zone spotlight and no longer offers Slots", () => {
  const lede = lobby.indexOf('className="vq-lobby-lede"');
  const spotlight = lobby.indexOf("<ZoneSpotlight />");
  const desks = lobby.indexOf('className="vq-lobby-desks"');
  assert.ok(
    lede > 0 && spotlight > lede && spotlight < desks,
    "spotlight sits between the headline and the sport rooms",
  );
  assert.match(lobby, /href="\/community" className="vq-zone-spotlight"/);
  assert.doesNotMatch(lobby, /\/slots|VqSlots/);
});

test("Zone glow animations stop under reduced motion", () => {
  const css = readFileSync("src/app/zone-focus.css", "utf8");
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.vq-zone-spotlight \{\s*animation: none;/,
  );
});
