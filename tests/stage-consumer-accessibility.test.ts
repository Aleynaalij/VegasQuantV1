import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// Bounded color-token check, not a full rendered WCAG certification.
const luminance = (hex: string) => {
  const rgb = hex
    .match(/[a-f\d]{2}/gi)!
    .map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
test("existing dark account/inbox foreground tokens retain normal-text contrast on solid panel tokens", async () => {
  const css = await readFile("src/app/premium.css", "utf8");
  const color = (name: string) => {
    const m = new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6});`).exec(css);
    assert(m, `${name} is explicit`);
    return m[1];
  };
  for (const fg of ["text", "muted", "gold"])
    for (const bg of ["bg", "panel", "panel2"]) {
      const a = luminance(color(fg)),
        b = luminance(color(bg));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert(ratio >= 4.5, `${fg}/${bg} contrast ${ratio.toFixed(2)} < 4.5`);
    }
});
