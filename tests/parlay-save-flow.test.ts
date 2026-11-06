import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { setImmediate } from "node:timers/promises";

// Execute the component's actual save orchestration with deferred synthetic reads/writes.
// This covers state ordering without claiming browser/rendering coverage.
const component = readFileSync("src/components/parlay-workshop.tsx", "utf8");
const saveSource = component.slice(
  component.indexOf("  async function save() {"),
  component.indexOf("  async function share("),
);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const confirmed = {
  id: "saved-a",
  title: "Submitted",
  legs: [],
  created_at: "2026-11-06",
  expires_at: "2026-11-07",
};

function harness() {
  const writes: {
    name: string;
    args: unknown;
    result: ReturnType<typeof deferred<any>>;
  }[] = [];
  const reads: { id: string; result: ReturnType<typeof deferred<any>> }[] = [];
  const storage = new Map<string, string>();
  const context: any = {
    AbortSignal,
    pendingSave: null,
    busy: false,
    saveInFlight: { current: null },
    accessReady: { current: true },
    epoch: { current: 1 },
    owner: { current: "account-a" },
    title: "Submitted",
    chosen: [{ leg_key: "a" }, { leg_key: "b" }],
    currentDraft: { current: { title: "Submitted", keys: ["a", "b"] } },
    saved: [{ ...confirmed, id: "older" }],
    promptVersion: 0,
    open: true,
    notice: "",
    error: "",
    pathname: "/parlays",
    mode: "parlays",
    plain: (message: string, fallback: string) => message || fallback,
    sessionStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    router: {
      replace: (url: string) => {
        context.route = url;
      },
    },
    supabase: {
      rpc(name: string, args: unknown) {
        const result = deferred<any>();
        writes.push({ name, args, result });
        return { abortSignal: () => result.promise };
      },
    },
    confirmParlaySave(id: string) {
      const result = deferred<any>();
      reads.push({ id, result });
      return result.promise;
    },
  };
  for (const key of [
    "busy",
    "error",
    "notice",
    "pendingSave",
    "reusedSave",
    "saved",
    "savedId",
    "savedPrompt",
    "promptVersion",
    "shareChecked",
    "chosen",
    "open",
  ]) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value: any) => {
      context[key] = typeof value === "function" ? value(context[key]) : value;
    };
  }
  const save = vm.runInNewContext(
    `${saveSource}\nsave`,
    context,
  ) as () => Promise<void>;
  return { save, context, writes, reads, storage };
}

test("unconfirmed create retains draft and a confirmation retry never writes twice", async () => {
  const h = harness();
  const first = h.save();
  h.writes[0].result.resolve({ data: confirmed.id, error: null });
  await setImmediate();
  h.reads[0].result.resolve({ confirmed: null, saved: null });
  await first;
  assert.equal(h.context.busy, false);
  assert.equal(h.context.pendingSave.id, confirmed.id);
  assert.equal(h.context.chosen.length, 2);
  assert.equal(h.context.title, "Submitted");
  assert.match(h.context.error, /confirmation could not load/);
  assert.equal(h.context.savedPrompt, undefined);
  assert.equal(h.storage.get("vq-parlay-recent:account-a"), confirmed.id);
  const retry = h.save();
  assert.equal(h.writes.length, 1);
  assert.equal(h.reads[1].id, confirmed.id);
  h.reads[1].result.resolve({ confirmed, saved: null });
  await retry;
  assert.equal(h.context.pendingSave, null);
  assert.equal(h.context.busy, false);
  assert.equal(h.context.savedPrompt.id, confirmed.id);
  assert.equal(
    h.context.saved.length,
    2,
    "failed list keeps previously loaded cards",
  );
  assert.equal(h.context.chosen.length, 0);
  assert.equal(h.context.shareChecked, false);
});

test("synchronous duplicate save calls share a single write", async () => {
  const h = harness();
  const first = h.save();
  await h.save();
  assert.equal(h.writes.length, 1);
  h.writes[0].result.resolve({ data: null, error: { message: "Rejected" } });
  await first;
  assert.equal(h.context.busy, false);
  assert.equal(h.context.chosen.length, 2);
});

test("confirmation never clears draft changes made while saving", async () => {
  const h = harness();
  const pending = h.save();
  h.writes[0].result.resolve({ data: confirmed.id, error: null });
  await setImmediate();
  h.context.title = "Newer draft";
  h.context.chosen = [{ leg_key: "c" }, { leg_key: "d" }];
  h.context.currentDraft.current = { title: "Newer draft", keys: ["c", "d"] };
  h.reads[0].result.resolve({ confirmed, saved: [] });
  await pending;
  assert.equal(h.context.title, "Newer draft");
  assert.deepEqual(h.context.chosen, [{ leg_key: "c" }, { leg_key: "d" }]);
  assert.equal(h.context.open, true);
  assert.match(h.context.notice, /current draft is kept/);
  assert.equal(h.context.savedPrompt.title, "Submitted");
});

test("a write returned after account invalidation cannot start confirmation or persist an ID", async () => {
  const h = harness();
  const pending = h.save();
  h.context.epoch.current++;
  h.context.owner.current = "account-b";
  h.writes[0].result.resolve({ data: confirmed.id, error: null });
  await pending;
  assert.equal(h.reads.length, 0);
  assert.equal(h.storage.size, 0);
  assert.equal(h.context.pendingSave, null);
});

test("late confirmation from an old account cannot alter the new account or unlock its save", async () => {
  const h = harness();
  const pending = h.save();
  h.writes[0].result.resolve({ data: confirmed.id, error: null });
  await setImmediate();
  // Model the synchronous auth callback's invalidation and a new account's active save.
  h.context.epoch.current = 2;
  h.context.owner.current = "account-b";
  h.context.pendingSave = null;
  h.context.saved = [];
  h.context.chosen = [];
  h.context.saveInFlight.current = 2;
  h.context.busy = true;
  h.reads[0].result.resolve({ confirmed, saved: [confirmed] });
  await pending;
  assert.equal(h.context.saved.length, 0);
  assert.equal(h.context.savedPrompt, undefined);
  assert.equal(h.context.pendingSave, null);
  assert.equal(h.context.notice, "");
  assert.equal(h.context.route, undefined);
  assert.equal(h.context.saveInFlight.current, 2);
  assert.equal(h.context.busy, true);
});
