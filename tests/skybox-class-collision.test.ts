import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Next keeps a visited route's CSS loaded after client navigation, so a global class shared with
// another page restyles Home. VQ Slots' Spin button once shared `.vq-spin` with the Skybox, which
// painted the jumbotron gold after Slots -> Home until a refresh.
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? cssFiles(path) : path.endsWith(".css") ? [path] : [];
  });
}

test("the Skybox root class is styled only by the Skybox stylesheet", () => {
  const owners = cssFiles("src")
    .filter((file) => /\.vq-skybox(?![a-z-])/.test(readFileSync(file, "utf8")))
    .map((file) => file.replaceAll("\\", "/"));
  assert.deepEqual(owners, ["src/app/skybox-spin.css"]);
});

test("the Skybox no longer uses the Slots Spin button class", () => {
  const tsx = readFileSync("src/components/skybox-spin.tsx", "utf8");
  assert.doesNotMatch(tsx, /["`.\s]vq-spin(?![a-z-])/);
});
