import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { notificationConnectionLabel } from "../src/lib/notifications";

test("combined inbox describes polling and errors without claiming realtime", async () => {
  assert.match(
    notificationConnectionLabel(true, true, false),
    /every 30 seconds/,
  );
  assert.match(notificationConnectionLabel(true, false, true), /unavailable/);
  assert.match(notificationConnectionLabel(true, false, false), /Checking/);
  for (const connected of [true, false])
    for (const failed of [true, false])
      assert.doesNotMatch(
        notificationConnectionLabel(true, connected, failed),
        /Live|Reconnecting/,
      );
  const source = await readFile(
    "src/components/notification-center.tsx",
    "utf8",
  );
  assert.match(
    source,
    /notificationConnectionLabel\(combinedViewer, connected, failed\)/,
  );
});
test("ordinary inbox preserves existing connection labels", () => {
  assert.equal(
    notificationConnectionLabel(false, true, true),
    "Live updates connected",
  );
  assert.equal(
    notificationConnectionLabel(false, true, false),
    "Live updates connected",
  );
  assert.equal(
    notificationConnectionLabel(false, false, true),
    "Reconnecting · your notification history is saved",
  );
  assert.equal(
    notificationConnectionLabel(false, false, false),
    "Live connection pending · refresh fallback enabled",
  );
});
