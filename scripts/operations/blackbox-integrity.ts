import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordJson = { [key: string]: Json };
type Snapshot = {
  project: string;
  tasks: (RecordJson & {
    id: string;
    version: number;
    events: (RecordJson & { version: number; task_id: string })[];
    outcomes: (RecordJson & { version: number; task_id: string })[];
  })[];
};

const canonical = (value: Json): string => {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
};
const sha = (value: Json) =>
  createHash("sha256").update(canonical(value)).digest("hex");

function authenticate(manifest: Json, key: string | undefined) {
  if (!/^[a-f0-9]{64}$/i.test(key ?? ""))
    throw new Error(
      "Expected a 32-byte external HMAC key in BLACKBOX_INTEGRITY_KEY",
    );
  return createHmac("sha256", Buffer.from(key ?? "", "hex"))
    .update(canonical(manifest))
    .digest("hex");
}

export function createManifest(
  snapshot: Snapshot,
  key: string | undefined,
  capturedAt: string,
) {
  if (
    snapshot.project !== "apwndmcsjxzjxnpxfywo" ||
    !Array.isArray(snapshot.tasks)
  )
    throw new Error("Expected isolated staging snapshot");
  const ids = new Set();
  const tasks = snapshot.tasks.map((task) => {
    if (ids.has(task.id) || task.events.length !== task.version)
      throw new Error("Duplicate task or incomplete event history");
    ids.add(task.id);
    const events = task.events.map((event, index) => {
      if (event.version !== index + 1 || event.task_id !== task.id)
        throw new Error("Invalid event order or association");
      return {
        version: event.version,
        digest: sha(event),
        evidence: sha(event.evidence),
      };
    });
    const seen = new Set();
    const outcomes = task.outcomes.map((outcome) => {
      if (
        outcome.task_id !== task.id ||
        task.events[outcome.version - 1]?.action !== "approve" ||
        seen.has(outcome.version)
      )
        throw new Error("Invalid outcome provenance");
      seen.add(outcome.version);
      return { version: outcome.version, digest: sha(outcome) };
    });
    if (task.events.some((e) => e.action === "approve" && !seen.has(e.version)))
      throw new Error("Missing approval outcome");
    const { events: _events, outcomes: _outcomes, ...record } = task;
    return { id: task.id, digest: sha(record), events, outcomes };
  });
  const manifest = { schema: 1, project: snapshot.project, capturedAt, tasks };
  return { ...manifest, signature: authenticate(manifest, key) };
}

export function verifyManifest(
  snapshot: Snapshot,
  signed: ReturnType<typeof createManifest>,
  key: string | undefined,
) {
  const { signature, ...manifest } = signed;
  if (
    !/^[a-f0-9]{64}$/.test(signature ?? "") ||
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(authenticate(manifest, key), "hex"),
    )
  )
    throw new Error("Invalid manifest signature");
  const current = createManifest(snapshot, key, manifest.capturedAt);
  if (current.signature !== signature)
    throw new Error("Snapshot differs from independently retained manifest");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, snapshotPath, manifestPath] = process.argv.slice(2);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const key = process.env.BLACKBOX_INTEGRITY_KEY;
  if (command === "sign")
    console.log(
      JSON.stringify(
        createManifest(snapshot, key, new Date().toISOString()),
        null,
        2,
      ),
    );
  else if (command === "verify") {
    verifyManifest(
      snapshot,
      JSON.parse(readFileSync(manifestPath, "utf8")),
      key,
    );
    console.log("Verified Blackbox snapshot");
  } else throw new Error("Expected sign or verify");
}
