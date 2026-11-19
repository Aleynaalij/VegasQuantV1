// Extend the approved replay WITHOUT changing any byte of the bf1c08a package.
// Called only by the disposable loopback harness after it proves data_directory.
import { pathToFileURL } from "node:url";
import { exportPreparationEvidence } from "./atlas-schema-preparation-evidence.mjs";
if (!process.env.ATLAS_PREPARATION_CLUSTER)
  throw Error("Disposable harness required");
await import("./atlas-schema-local-replay.mjs");
if (process.exitCode) throw Error("Original native replay failed");
const { default: pg } = await import(
  pathToFileURL(process.env.ATLAS_REPLAY_PG_MODULE)
);
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  database: "atlas_schema_replay",
});
await db.connect();
try {
  if (
    (await db.query("select current_setting('data_directory') dir")).rows[0]
      .dir !== process.env.ATLAS_PREPARATION_CLUSTER
  )
    throw Error("Wrong disposable cluster");
  await exportPreparationEvidence(
    db,
    process.argv[process.argv.indexOf("--out") + 1],
  );
} finally {
  await db.end();
}
