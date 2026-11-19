// DISPOSABLE LOOPBACK ONLY. No hosted passwords, factors, sessions or Auth writes.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import net from "node:net";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";

await import("./atlas-identity-seven-day-rehearsal.mjs");
if (process.exitCode) throw Error("Prerequisite rehearsal failed");
const { default: pg } = await import(
  pathToFileURL(process.env.ATLAS_REPLAY_PG_MODULE)
);
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  database: "atlas_schema_preparation",
});
await db.connect();
const out = process.argv[process.argv.indexOf("--out") + 1];
const candidate = process.argv.includes("--candidate");
const report = {
  candidate,
  status: "RUNNING",
  scope: "DISPOSABLE_REAL_AUTH_ONLY",
  version: "v2.198.0",
  checks: [],
  accounts: [],
};
let phase = "LOCAL_PIN",
  service,
  smtp,
  proxy,
  sms;
let mailConnections = 0,
  smsRequests = 0;
const binary = process.env.ATLAS_AUTH_BIN;
const version = binary && spawnSync(binary, ["version"], { encoding: "utf8" });
const secret = randomBytes(48).toString("base64url");
const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(role) {
  const body =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      role,
      aud: "authenticated",
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
function claims(token) {
  const [h, p, s] = token.split(".");
  const expected = createHmac("sha256", secret)
    .update(h + "." + p)
    .digest();
  assert(timingSafeEqual(expected, Buffer.from(s, "base64url")));
  return JSON.parse(Buffer.from(p, "base64url"));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function listen(server, port) {
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(port, "127.0.0.1", resolve),
  );
  return server;
}
function requireOk(r, label) {
  if (r.error)
    throw Error(
      label + " failed: " + (r.error.code ?? r.error.status ?? "AUTH_ERROR"),
    );
  return r.data;
}
function totp(seed) {
  let bits = "";
  for (const c of seed.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(c)
      .toString(2)
      .padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const t = Buffer.alloc(8);
  t.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(t).digest();
  const offset = hash.at(-1) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function authorization(token) {
  const c = claims(token);
  await db.query("begin");
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify(c),
    ]);
    await db.query("set local role authenticated");
    return (
      await db.query(
        "select public.vq_private_access_stage_authorized() gate,private.has_membership() member",
      )
    ).rows[0];
  } finally {
    await db.query("rollback");
  }
}
try {
  assert(process.env.ATLAS_PREPARATION_CLUSTER);
  assert.equal(
    (await db.query("select current_setting('data_directory') d")).rows[0].d,
    process.env.ATLAS_PREPARATION_CLUSTER,
  );
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), report.version);
  const runtime = JSON.parse(
    await readFile(
      "docs/atlas/staging-sign-in-review/auth-compatibility/runtime.json",
      "utf8",
    ),
  );
  assert.equal(
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex"),
    runtime.binary_sha256,
  );
  const accounts = JSON.parse(
    await readFile(
      "docs/atlas/staging-sign-in-review/account-map.json",
      "utf8",
    ),
  ).identities;
  // Replace ONLY disposable platform stand-ins with genuine managed Auth tables.
  // Retarget application FKs after replaying the exact inert identity SQL below.
  phase = "REAL_AUTH_SCHEMA";
  const fks = (
    await db.query(
      "select conrelid::regclass::text rel,conname,pg_get_constraintdef(oid) def from pg_constraint where contype='f' and confrelid='auth.users'::regclass and connamespace<>'auth'::regnamespace",
    )
  ).rows;
  const originalIds = JSON.parse(
    await readFile(
      "docs/atlas/schema-preparation/reduced-staging-snapshot.json",
      "utf8",
    ),
  ).users.map((u) => u.id);
  for (const a of accounts.filter((a) => a.kind === "control"))
    for (const table of [
      "vq_private_access_stage.private_development_owners",
      "vq_private_access_stage.entitlements",
      "vq_fixture.age_states",
      "vq_fixture.entitlements",
    ])
      await db.query(`delete from ${table} where user_id=$1`, [a.id]);
  await db.query(
    "alter table auth.users rename to users_standin;alter table auth.sessions rename to sessions_standin;alter table auth.users_standin rename constraint users_pkey to users_standin_pkey;alter table auth.sessions_standin rename constraint sessions_pkey to sessions_standin_pkey",
  );
  const env = {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    GOTRUE_JWT_SECRET: secret,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DB_DRIVER: "postgres",
    DB_NAMESPACE: "auth",
    GOTRUE_DB_NAMESPACE: "auth",
    DATABASE_URL:
      "postgres://postgres@127.0.0.1:55439/atlas_schema_preparation?sslmode=disable&search_path=auth",
    API_EXTERNAL_URL: "http://127.0.0.1:55325",
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: "55324",
    GOTRUE_SITE_URL: "http://127.0.0.1:55325",
    GOTRUE_DISABLE_SIGNUP: "true",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_EXTERNAL_PHONE_ENABLED: "false",
    GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "false",
    GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true",
    GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true",
    GOTRUE_MFA_PHONE_ENROLL_ENABLED: "false",
    GOTRUE_MFA_PHONE_VERIFY_ENABLED: "false",
    GOTRUE_MFA_RATE_LIMIT_CHALLENGE_AND_VERIFY: "100",
    GOTRUE_RATE_LIMIT_VERIFY: "100",
    GOTRUE_SMTP_HOST: "127.0.0.1",
    GOTRUE_SMTP_PORT: "55326",
    GOTRUE_SMTP_ADMIN_EMAIL: "sink@local.invalid",
    GOTRUE_SMTP_SENDER_NAME: "Local rehearsal",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_HOOK_SEND_SMS_ENABLED: "true",
    GOTRUE_HOOK_SEND_SMS_URI: "http://127.0.0.1:55327",
    GOTRUE_HOOK_SEND_SMS_SECRETS:
      "v1,whsec_" + randomBytes(32).toString("base64"),
    GOTRUE_LOG_LEVEL: "panic",
  };
  for (const name of [
    "PASSWORD_CHANGED",
    "EMAIL_CHANGED",
    "PHONE_CHANGED",
    "IDENTITY_LINKED",
    "IDENTITY_UNLINKED",
    "MFA_FACTOR_ENROLLED",
    "MFA_FACTOR_UNENROLLED",
  ])
    env["GOTRUE_MAILER_NOTIFICATIONS_" + name + "_ENABLED"] = "false";
  const migrated = spawnSync(binary, ["migrate"], {
    env,
    cwd: dirname(binary),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (migrated.status !== 0) {
    report.migration_exit = migrated.status;
    throw Error("Auth migration failed");
  }
  const columns = (
    await db.query(
      "select a.attname from pg_attribute a join pg_attribute b on a.attname=b.attname and b.attrelid='auth.users_standin'::regclass and b.attnum>0 and not b.attisdropped where a.attrelid='auth.users'::regclass and a.attnum>0 and not a.attisdropped and a.attgenerated='' order by a.attnum",
    )
  ).rows
    .map((r) => '"' + r.attname + '"')
    .join(",");
  await db.query(
    `insert into auth.users(${columns}) select ${columns} from auth.users_standin where id=any($1)`,
    [originalIds],
  );
  const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
  for (const f of fks)
    await db.query(
      `alter table ${f.rel} drop constraint ${quote(f.conname)};alter table ${f.rel} add constraint ${quote(f.conname)} ${f.def}`,
    );
  await db.query(
    await readFile(
      "docs/atlas/identity-seven-day-review/identities-seven-day.sql",
      "utf8",
    ),
  );
  report.checks.push({
    name: "Exact inert identity SQL on genuine Auth schema",
    result: "PASS",
  });
  phase = "DELIVERY_SINKS";
  smtp = await listen(
    net.createServer((socket) => {
      mailConnections++;
      socket.on("error", () => {});
      socket.write("220 local.invalid ESMTP\r\n");
      socket.on("data", () => socket.end("221 bye\r\n"));
    }),
    55326,
  );
  sms = await listen(
    http.createServer((req, res) => {
      smsRequests++;
      req.resume();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    }),
    55327,
  );
  await new Promise((resolve) => {
    const s = net.connect(55326, "127.0.0.1", () => s.end("QUIT\r\n"));
    s.on("close", resolve);
    s.on("data", () => {});
  });
  await fetch("http://127.0.0.1:55327", { method: "POST", body: "{}" });
  assert.equal(mailConnections, 1);
  assert.equal(smsRequests, 1);
  mailConnections = 0;
  smsRequests = 0;
  report.sink_positive_controls = "PASS";
  proxy = await listen(
    http.createServer(async (req, res) => {
      try {
        if (!req.url.startsWith("/auth/v1/")) {
          res.writeHead(404);
          res.end();
          return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const headers = { ...req.headers };
        delete headers.host;
        delete headers.connection;
        delete headers["content-length"];
        const response = await fetch(
          "http://127.0.0.1:55324" + req.url.slice(8),
          {
            method: req.method,
            headers,
            body: ["GET", "HEAD"].includes(req.method)
              ? undefined
              : Buffer.concat(chunks),
            redirect: "manual",
          },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(502);
        res.end();
      }
    }),
    55325,
  );
  service = spawn(binary, ["serve"], {
    env,
    cwd: dirname(binary),
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:55324/health");
      if (r.ok) break;
    } catch {}
    await wait(100);
  }
  assert.equal(
    (await (await fetch("http://127.0.0.1:55324/health")).json()).version,
    report.version,
  );
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const admin = createClient(
    "http://127.0.0.1:55325",
    jwt("service_role"),
    options,
  );
  const anon = jwt("anon");
  const secrets = new Map();
  if (candidate) {
    phase = "PROPOSED_COMPATIBILITY";
    const compatibility = await readFile(
      "docs/atlas/staging-sign-in-review/auth-compatibility/compatibility.sql",
      "utf8",
    );
    const fixtureState = async () =>
      JSON.stringify(
        (
          await db.query(
            "select (select jsonb_agg(to_jsonb(e) order by user_id) from vq_fixture.entitlements e) entitlements,(select jsonb_agg(to_jsonb(a) order by user_id) from vq_fixture.age_states a) ages",
          )
        ).rows,
      );
    const before = await fixtureState();
    await db.query(compatibility.replace(/commit;\s*$/, "rollback;"));
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from auth.users where id=any($1) and instance_id is null",
          [accounts.filter((a) => a.kind === "control").map((a) => a.id)],
        )
      ).rows[0].n,
      6,
    );
    assert.equal(await fixtureState(), before);
    report.compatibility_rollback = "PASS";
    await db.query(compatibility);
    assert.equal(await fixtureState(), before);
    await assert.rejects(
      db.query(compatibility),
      /Compatibility preconditions failed/,
    );
    await db.query("rollback");
    report.compatibility_single_use = "PASS";
    report.control_states_preserved = "PASS";
    report.compatibility = "PROPOSED_LOCAL_ONLY";
  }
  phase = "ADMIN_PASSWORD_COMPATIBILITY";
  for (const a of accounts) {
    const password = randomBytes(32).toString("base64url");
    secrets.set(a.id, { password });
    const data =
      a.kind === "owner"
        ? requireOk(
            await admin.auth.admin.createUser({
              id: a.id,
              email: a.email,
              password,
              email_confirm: true,
            }),
            "createUser",
          )
        : requireOk(
            await admin.auth.admin.updateUserById(a.id, { password }),
            "updateUserById",
          );
    assert.equal(data.user.id, a.id);
  }
  await db.query(
    await readFile(
      "docs/atlas/staging-sign-in-review/owner-support.sql",
      "utf8",
    ),
  );
  phase = "ENROLLMENT";
  for (const a of accounts) {
    const client = createClient("http://127.0.0.1:55325", anon, options);
    const login = requireOk(
      await client.auth.signInWithPassword({
        email: a.email,
        password: secrets.get(a.id).password,
      }),
      "password sign-in",
    );
    assert.equal(login.user.id, a.id);
    assert.equal(claims(login.session.access_token).aal, "aal1");
    assert.equal((await authorization(login.session.access_token)).gate, false);
    const factor = requireOk(
      await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Local rehearsal",
      }),
      "TOTP enroll",
    );
    secrets.get(a.id).factor = factor.id;
    secrets.get(a.id).seed = factor.totp.secret;
    const verified = requireOk(
      await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totp(factor.totp.secret),
      }),
      "TOTP verify",
    );
    assert.equal(claims(verified.access_token).aal, "aal2");
    const access = await authorization(verified.access_token);
    assert.equal(access.gate, true);
    assert.equal(access.member, a.expected_member);
    requireOk(
      await client.auth.signOut({ scope: "global" }),
      "global sign-out",
    );
    assert.equal((await authorization(verified.access_token)).gate, false);
    report.accounts.push({
      email: a.email,
      uuid_unchanged: true,
      aal1_gate: false,
      aal2_gate: true,
      member: access.member,
      revoked_session_gate: false,
      result: "PASS",
    });
  }
  phase = "FRESH_PASSWORD_TOTP_LOGIN";
  await wait(31000 - (Date.now() % 30000));
  for (const a of accounts) {
    const s = secrets.get(a.id);
    const client = createClient("http://127.0.0.1:55325", anon, options);
    requireOk(
      await client.auth.signInWithPassword({
        email: a.email,
        password: s.password,
      }),
      "fresh password login",
    );
    const verified = requireOk(
      await client.auth.mfa.challengeAndVerify({
        factorId: s.factor,
        code: totp(s.seed),
      }),
      "fresh TOTP verify",
    );
    assert.equal(claims(verified.access_token).aal, "aal2");
    assert.equal(
      (await authorization(verified.access_token)).member,
      a.expected_member,
    );
    requireOk(
      await client.auth.signOut({ scope: "global" }),
      "fresh global sign-out",
    );
    assert.equal((await authorization(verified.access_token)).gate, false);
    s.password = "";
    s.seed = "";
  }
  report.fresh_logins = "8/8 PASS";
  report.sessions_after = (
    await db.query("select count(*)::int n from auth.sessions")
  ).rows[0].n;
  assert.equal(report.sessions_after, 0);
  const catalog = (
    await db.query(
      await readFile(
        "docs/atlas/free-home-review/catalog-assertions-after-free-home.sql",
        "utf8",
      ),
    )
  ).rows;
  assert(catalog.every((r) => r.result === "PASS"));
  report.catalog_checks = catalog.length;
  report.email_identities_created_by_admin_api = (
    await db.query(
      "select count(*)::int n from auth.identities where provider='email' and user_id=any($1)",
      [accounts.map((a) => a.id)],
    )
  ).rows[0].n;
  report.control_identity_rows_written_directly = 0;
  await wait(500);
  report.mail_connections = mailConnections;
  report.sms_requests = smsRequests;
  assert.equal(mailConnections, 0);
  assert.equal(smsRequests, 0);
  report.status = "PASS";
} catch (e) {
  await db.query("rollback");
  report.status = "FAIL";
  report.phase = phase;
  report.error = e.message;
  report.unexpected_public_tables = (
    await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    )
  ).rows;
  process.exitCode = 1;
} finally {
  if (service) {
    service.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => service.kill("SIGKILL"), 3000);
      service.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  for (const server of [proxy, smtp, sms])
    if (server) await new Promise((resolve) => server.close(resolve));
  report.mail_connections = mailConnections;
  report.sms_requests = smsRequests;
  if (mailConnections !== 0 || smsRequests !== 0) {
    report.status = "FAIL";
    report.error = "Unexpected delivery request";
    process.exitCode = 1;
  }
  await writeFile(
    out +
      (candidate ? "/candidate-rehearsal.json" : "/baseline-rehearsal.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
}
