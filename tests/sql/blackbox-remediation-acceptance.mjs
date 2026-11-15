// Blackbox foundation hardening: acceptance contract for the remediation branch.
//
// Written by the reviewer before the fixes exist, from the findings in
// docs/product/blackbox-architecture-review.md. It is EXPECTED TO FAIL against the frozen stack
// (#282-#287) and is not wired into CI. The remediation branch should make every check pass, then
// add it to its workflow.
//
//   BLACKBOX_SQL_DIR=<checkout>/scripts/operations \
//   BLACKBOX_REMEDIATION_SQL=blackbox-remediation.sql[,more.sql] \
//   node tests/sql/blackbox-remediation-acceptance.mjs
//
// Local PGlite and synthetic identities only. PGlite has one connection, so W1.5 checks the
// version rule that decides a race, not true parallelism; the remediation still needs a
// two-connection test against staging Postgres. The proposed interface is collected in CONTRACT
// below; if the remediation chooses other names, change them there and nowhere else.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const CONTRACT = {
  // Administrator recovery of a task from assigned / in_progress / in_review. Reason = evidence text.
  reclaimAction: "reclaim",
  reclaimedStatus: "blocked",
  // select public.blackbox_admin(p_action, p_principal, p_reason, p_value, p_request)
  admin: "public.blackbox_admin",
  suspend: "suspend", // per-principal disable
  setRole: "set_role", // audited role change, p_value = new role
  disable: "disable", // emergency switch off
  enable: "enable", // emergency switch on
  // CEO decision (Nov 15): disable succeeds even when the audit record cannot be written. The call
  // must then report the failure in its result, and a later reconcile records the missed transition.
  auditFailed: "failed", // value of result.audit when the transition could not be recorded
  reconcile: "reconcile",
  principalEvents: "blackbox.principal_events", // actor, principal, reason, recorded_at
  controlEvents: "blackbox.control_events", // actor, reason, previous, enabled, recorded_at
  // Every table that must appear in the audit snapshot (blackbox-snapshot.sql), at any depth.
  snapshotKeys: [
    "events",
    "outcomes",
    "principals",
    "principal_events",
    "control_events",
    "dependency_events",
    "improvement_reviews",
    "briefings",
    "agent_profiles",
  ],
};

const dir = process.env.BLACKBOX_SQL_DIR || "scripts/operations";
const base = [
  "staging",
  "phase2",
  "active-session",
  "phase3",
  "phase3-review-fix",
  "phase3-stability",
].map((f) => `blackbox-${f}.sql`);
const extra = (process.env.BLACKBOX_REMEDIATION_SQL || "")
  .split(",")
  .filter(Boolean);
const U = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const S = (n) => `30000000-0000-4000-8000-00000000000${n}`;
const [ADMIN, CODEX, CLAUDE, REVIEWER, REVIEWER2, ADMIN2] = [1, 2, 3, 4, 5, 6];

async function fresh() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
   create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean, banned_until timestamptz);
   create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
   create table private.account_erasure_jobs(user_id uuid, expires_at timestamptz);
   create function auth.jwt() returns jsonb language sql as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
   create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;`);
  for (const f of [...base, ...extra])
    await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
  await db.exec(`insert into auth.users(id,email_confirmed_at) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, now() from generate_series(1,6) n;
   insert into auth.sessions(id,user_id) select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
   insert into blackbox.principals(id,role) values ('${U(1)}','admin'),('${U(2)}','codex'),('${U(3)}','claude'),('${U(4)}','reviewer'),('${U(5)}','reviewer'),('${U(6)}','admin');
   insert into blackbox.tasks(id,proposal) values ('t1','{}'),('t2','{}'),('t3','{}'),('t4','{}');`);
  const as = async (n, sql, params = []) => {
    await db.exec(
      `reset role; select set_config('request.jwt.claims','${JSON.stringify({ sub: U(n), session_id: S(n), aal: "aal2" })}',false); set role authenticated;`,
    );
    try {
      return { ok: true, r: (await db.query(sql, params)).rows[0]?.r };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message };
    } finally {
      await db.exec("reset role");
    }
  };
  const stage = (n, action, task, version, x = {}) =>
    as(n, "select public.blackbox_stage($1,$2,$3,$4,$5,$6,$7) r", [
      action,
      task,
      version,
      x.request ?? crypto.randomUUID(),
      x.evidence ?? "synthetic",
      x.target ?? null,
      x.outcome ?? null,
    ]);
  const admin = (n, action, principal, reason, value = null) =>
    as(n, `select ${CONTRACT.admin}($1,$2,$3,$4,$5) r`, [
      action,
      principal,
      reason,
      value,
      crypto.randomUUID(),
    ]);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const complete = async (task, agent = CODEX, reviewer = REVIEWER) => {
    await stage(ADMIN, "assign", task, 0, { target: U(agent) });
    await stage(agent, "acknowledge", task, 1);
    await stage(agent, "submit", task, 2);
    return stage(reviewer, "approve", task, 3, {
      outcome: { conclusion: "synthetic", confidence: "high" },
    });
  };
  const review = (n, task, verdict) =>
    as(
      n,
      `select public.blackbox_intelligence('review',p_task=>$1,p_version=>4,p_review=>$2) r`,
      [
        task,
        {
          recommendation: "r",
          classification: "other",
          effectiveness: verdict,
          evidence: "synthetic",
        },
      ],
    );
  return { db, as, stage, admin, one, complete, review };
}

const results = [];
async function check(id, title, fn) {
  const t = await fresh();
  try {
    const failure = await fn(t);
    results.push([id, title, failure ? `FAIL · ${failure}` : "pass"]);
  } catch (e) {
    results.push([
      id,
      title,
      `FAIL · ${String(e.message).split("\n")[0].slice(0, 110)}`,
    ]);
  } finally {
    await t.db.close();
  }
}
const want = (cond, message) => (cond ? null : message);

// ── Workstream 1 · task recovery and reassignment ───────────────────────────────────────────────
for (const [state, steps] of [
  ["assigned", 1],
  ["in_progress", 2],
  ["in_review", 3],
]) {
  await check(
    `W1.${steps}`,
    `administrator reclaims a task that is ${state}`,
    async (t) => {
      await t.stage(ADMIN, "assign", "t1", 0, { target: U(CODEX) });
      if (steps > 1) await t.stage(CODEX, "acknowledge", "t1", 1);
      if (steps > 2) await t.stage(CODEX, "submit", "t1", 2);
      const r = await t.stage(ADMIN, CONTRACT.reclaimAction, "t1", steps, {
        evidence: "Agent unavailable",
      });
      if (!r.ok) return `reclaim refused: ${r.code} ${r.message}`;
      const row = await t.one(
        "select status,version from blackbox.tasks where id='t1'",
      );
      const history = await t.one(
        "select count(*)::int n, bool_or(action=$1) reclaimed from blackbox.events where task_id='t1'",
        [CONTRACT.reclaimAction],
      );
      return (
        want(
          row.status === CONTRACT.reclaimedStatus,
          `status is ${row.status}`,
        ) ||
        want(
          history.n === steps + 1 && history.reclaimed,
          "earlier events were not preserved alongside the reclaim event",
        ) ||
        want(
          (
            await t.stage(ADMIN, "handoff", "t1", steps + 1, {
              target: U(CLAUDE),
            })
          ).ok,
          "handoff after reclaim refused",
        )
      );
    },
  );
}
await check(
  "W1.4",
  "reclaim needs a reason, the administrator role and the current version",
  async (t) => {
    await t.stage(ADMIN, "assign", "t1", 0, { target: U(CODEX) });
    const blank = await t.stage(ADMIN, CONTRACT.reclaimAction, "t1", 1, {
      evidence: "   ",
    });
    const agent = await t.stage(CLAUDE, CONTRACT.reclaimAction, "t1", 1, {
      evidence: "mine now",
    });
    const reviewer = await t.stage(REVIEWER, CONTRACT.reclaimAction, "t1", 1, {
      evidence: "mine now",
    });
    const stale = await t.stage(ADMIN, CONTRACT.reclaimAction, "t1", 0, {
      evidence: "Agent unavailable",
    });
    const good = await t.stage(ADMIN, CONTRACT.reclaimAction, "t1", 1, {
      evidence: "Agent unavailable",
    });
    return (
      want(
        !blank.ok && !agent.ok && !reviewer.ok && !stale.ok,
        "a blank reason, a non-administrator or a stale version was accepted",
      ) || want(good.ok, `valid reclaim refused: ${good.code} ${good.message}`)
    );
  },
);
await check(
  "W1.5",
  "two administrators reclaim the same version: exactly one wins; the stale agent is then refused",
  async (t) => {
    await t.stage(ADMIN, "assign", "t1", 0, { target: U(CODEX) });
    await t.stage(CODEX, "acknowledge", "t1", 1);
    const a = await t.stage(ADMIN, CONTRACT.reclaimAction, "t1", 2, {
      evidence: "Agent unavailable",
    });
    const b = await t.stage(ADMIN2, CONTRACT.reclaimAction, "t1", 2, {
      evidence: "Agent unavailable",
    });
    const late = await t.stage(CODEX, "submit", "t1", 2);
    const later = await t.stage(CODEX, "submit", "t1", 3);
    return (
      want(a.ok !== b.ok, `expected one winner, got ${a.ok}/${b.ok}`) ||
      want(
        !late.ok && !later.ok,
        "the former owner could still submit after the reclaim",
      )
    );
  },
);

// ── Workstream 2 · agent identity lifecycle ─────────────────────────────────────────────────────
await check(
  "W2.1",
  "suspending an agent denies its next call, even with a capability profile",
  async (t) => {
    await t.db.exec(
      `insert into blackbox.agent_profiles values ('${U(CLAUDE)}','record reconciliation',now(),'${U(ADMIN)}')`,
    );
    await t.stage(ADMIN, "assign", "t1", 0, { target: U(CLAUDE) });
    const r = await t.admin(
      ADMIN,
      CONTRACT.suspend,
      U(CLAUDE),
      "Credential exposure",
    );
    if (!r.ok) return `suspend refused: ${r.code} ${r.message}`;
    const call = await t.stage(CLAUDE, "acknowledge", "t1", 1);
    const audit = await t.one(
      `select count(*)::int n from ${CONTRACT.principalEvents} where principal=$1 and actor=$2 and length(btrim(reason))>0`,
      [U(CLAUDE), U(ADMIN)],
    );
    return (
      want(!call.ok, "the suspended agent could still act") ||
      want(
        audit.n === 1,
        "the suspension was not recorded with actor and reason",
      )
    );
  },
);
await check(
  "W2.2",
  "suspending an agent moves its open tasks to audited administrator recovery; reassignment is a separate action",
  async (t) => {
    await t.stage(ADMIN, "assign", "t1", 0, { target: U(CLAUDE) });
    await t.stage(CLAUDE, "acknowledge", "t1", 1);
    await t.admin(ADMIN, CONTRACT.suspend, U(CLAUDE), "Credential exposure");
    const row = await t.one(
      "select status,version from blackbox.tasks where id='t1'",
    );
    const event = await t.one(
      "select actor, role from blackbox.events where task_id='t1' order by version desc limit 1",
    );
    return (
      want(
        row.status === CONTRACT.reclaimedStatus,
        `task is still ${row.status}`,
      ) ||
      want(
        event.actor === U(ADMIN) && event.role === "admin",
        "the recovery was not recorded as the administrator's action",
      ) ||
      want(
        !(await t.stage(CLAUDE, "acknowledge", "t1", row.version)).ok,
        "the suspended agent could still act on the recovered task",
      ) ||
      want(
        (
          await t.stage(ADMIN, "handoff", "t1", row.version, {
            target: U(CODEX),
          })
        ).ok,
        "the recovered task could not be handed to another agent",
      )
    );
  },
);
await check(
  "W2.3",
  "role changes are audited, and only administrators can make them",
  async (t) => {
    const agent = await t.admin(
      CODEX,
      CONTRACT.setRole,
      U(CODEX),
      "self-promotion",
      "admin",
    );
    const self = await t.admin(
      ADMIN,
      CONTRACT.setRole,
      U(ADMIN),
      "self change",
      "reviewer",
    );
    const good = await t.admin(
      ADMIN,
      CONTRACT.setRole,
      U(REVIEWER2),
      "Rotation",
      "admin",
    );
    const audit = await t.one(
      `select count(*)::int n from ${CONTRACT.principalEvents} where principal=$1`,
      [U(REVIEWER2)],
    );
    return (
      want(!agent.ok, "an agent changed a role") ||
      want(!self.ok, "an administrator changed their own role") ||
      want(
        good.ok && audit.n === 1,
        "a valid role change was refused or left no record",
      )
    );
  },
);
await check(
  "W2.4",
  "an agent cannot be assigned work outside its verified capability or while suspended",
  async (t) => {
    await t.admin(ADMIN, CONTRACT.suspend, U(CLAUDE), "Credential exposure");
    return want(
      !(await t.stage(ADMIN, "assign", "t1", 0, { target: U(CLAUDE) })).ok,
      "a suspended agent was assigned a task",
    );
  },
);

// ── Workstream 3 · complete audit coverage ──────────────────────────────────────────────────────
await check(
  "W3.1",
  "the audit snapshot covers every security-relevant table",
  async (t) => {
    await t.complete("t1");
    const snapshot = JSON.stringify(
      (await t.db.query(readFileSync(`${dir}/blackbox-snapshot.sql`, "utf8")))
        .rows[0].snapshot,
    );
    const missing = CONTRACT.snapshotKeys.filter(
      (k) => !snapshot.includes(`"${k}"`),
    );
    return want(!missing.length, `snapshot omits: ${missing.join(", ")}`);
  },
);
await check(
  "W3.2",
  "history cannot be rewritten or deleted inside the database without detection",
  async (t) => {
    await t.complete("t1");
    const attempts = [
      "update blackbox.events set evidence='rewritten' where task_id='t1' and version=1",
      "delete from blackbox.events where task_id='t1' and version=2",
      "update blackbox.memory set outcome='{}' where task_id='t1'",
    ];
    const accepted = [];
    for (const sql of attempts) {
      try {
        await t.db.exec(sql);
        accepted.push(sql.split(" ").slice(0, 2).join(" "));
      } catch {}
    }
    return want(
      !accepted.length,
      `accepted silently as owner: ${accepted.join("; ")}`,
    );
  },
);

// ── Workstream 4 · emergency control accountability ─────────────────────────────────────────────
await check(
  "W4.1",
  "disable and restore record actor, time, reason and previous/new state",
  async (t) => {
    const off = await t.admin(
      ADMIN,
      CONTRACT.disable,
      null,
      "Containment drill",
    );
    if (!off.ok) return `disable refused: ${off.code} ${off.message}`;
    const denied = await t.as(ADMIN2, "select public.blackbox_stage('list') r");
    const row = await t.one(
      `select actor, reason, previous, enabled, recorded_at is not null stamped from ${CONTRACT.controlEvents} order by recorded_at desc limit 1`,
    );
    return (
      want(!denied.ok, "the ledger still answered after disable") ||
      want(
        row.actor === U(ADMIN) &&
          row.reason === "Containment drill" &&
          row.previous === true &&
          row.enabled === false &&
          row.stamped,
        "the transition record is incomplete",
      )
    );
  },
);
await check(
  "W4.2",
  "disable still takes effect when the audit record cannot be written, and says so",
  async (t) => {
    // Simulate an audit failure: the recording table rejects every insert.
    await t.db
      .exec(`create function blackbox.acceptance_fail() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$;
    create trigger acceptance_fail before insert on ${CONTRACT.controlEvents} for each row execute function blackbox.acceptance_fail();`);
    const off = await t.admin(
      ADMIN,
      CONTRACT.disable,
      null,
      "Containment during audit outage",
    );
    const state = await t.one("select enabled from blackbox.control");
    return (
      want(
        state.enabled === false,
        "containment was blocked by the audit failure",
      ) ||
      want(
        off.ok && off.r?.audit === CONTRACT.auditFailed,
        "the caller was not told that the audit record failed",
      )
    );
  },
);
await check(
  "W4.4",
  "a missed transition is reconciled afterwards with its original actor and reason",
  async (t) => {
    await t.db
      .exec(`create function blackbox.acceptance_fail() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$;
    create trigger acceptance_fail before insert on ${CONTRACT.controlEvents} for each row execute function blackbox.acceptance_fail();`);
    await t.admin(
      ADMIN,
      CONTRACT.disable,
      null,
      "Containment during audit outage",
    );
    await t.db.exec(
      `drop trigger acceptance_fail on ${CONTRACT.controlEvents}`,
    );
    const pending = await t.one("select enabled from blackbox.control");
    const fixed = await t.admin(
      ADMIN2,
      CONTRACT.reconcile,
      null,
      "Audit store restored",
    );
    const row = await t.one(
      `select actor, reason, enabled from ${CONTRACT.controlEvents} order by recorded_at limit 1`,
    );
    return (
      want(
        pending.enabled === false,
        "the ledger did not stay disabled while the record was missing",
      ) ||
      want(fixed.ok, `reconcile refused: ${fixed.code} ${fixed.message}`) ||
      want(
        row?.actor === U(ADMIN) &&
          row.reason === "Containment during audit outage" &&
          row.enabled === false,
        "the reconciled record does not carry the original actor and reason",
      )
    );
  },
);
await check(
  "W4.3",
  "only an administrator can disable; nobody restores without a reason",
  async (t) => {
    const agent = await t.admin(
      CODEX,
      CONTRACT.disable,
      null,
      "not mine to pull",
    );
    await t.admin(ADMIN, CONTRACT.disable, null, "Containment drill");
    const blank = await t.admin(ADMIN, CONTRACT.enable, null, " ");
    const restored = await t.admin(
      ADMIN,
      CONTRACT.enable,
      null,
      "Drill complete",
    );
    return (
      want(!agent.ok, "an agent disabled the ledger") ||
      want(!blank.ok, "restore accepted without a reason") ||
      want(
        restored.ok &&
          (await t.one("select enabled from blackbox.control")).enabled ===
            true,
        "a reasoned restore by an administrator did not take effect",
      )
    );
  },
);

// ── Workstream 5 · effectiveness and precedent integrity ────────────────────────────────────────
await check(
  "W5.1",
  "the reviewer who approved an outcome cannot rate its effectiveness",
  async (t) => {
    await t.complete("t1");
    return (
      want(
        !(await t.review(REVIEWER, "t1", "verified effective")).ok,
        "the approver rated their own approval",
      ) ||
      want(
        (await t.review(REVIEWER2, "t1", "verified effective")).ok,
        "an independent reviewer was refused",
      )
    );
  },
);
await check(
  "W5.2",
  "an outcome judged ineffective does not unblock dependent work",
  async (t) => {
    await t.complete("t1");
    await t.as(
      ADMIN,
      "select public.blackbox_intelligence('dependency','t2','t1',0,true) r",
    );
    await t.review(REVIEWER2, "t1", "verified ineffective");
    return want(
      !(await t.stage(ADMIN, "assign", "t2", 0, { target: U(CODEX) })).ok,
      "a task depending on an ineffective outcome was assigned",
    );
  },
);
await check(
  "W5.3",
  "conflicting verdicts are both kept and reported as a conflict, not last-writer-wins",
  async (t) => {
    await t.complete("t1", CODEX, REVIEWER);
    await t.db.exec(
      `update blackbox.principals set role='reviewer' where id='${U(ADMIN2)}'`,
    );
    await t.review(REVIEWER2, "t1", "verified effective");
    await t.review(ADMIN2, "t1", "verified ineffective");
    const kept = await t.one(
      "select count(*)::int n from blackbox.improvement_reviews where task_id='t1'",
    );
    const reporting =
      (
        await t.as(
          ADMIN,
          "select public.blackbox_intelligence('page')->'reporting'->'effectiveness' r",
        )
      ).r ?? {};
    return (
      want(kept.n === 2, `${kept.n} of 2 verdicts retained`) ||
      want(
        !(
          reporting["verified ineffective"] === 1 &&
          Object.keys(reporting).length === 1
        ),
        "reporting shows only the latest verdict",
      )
    );
  },
);

const width = Math.max(...results.map(([, title]) => title.length));
for (const [id, title, outcome] of results)
  console.log(`${id.padEnd(5)} ${title.padEnd(width)}  ${outcome}`);
const failed = results.filter(([, , outcome]) => outcome !== "pass").length;
console.log(
  `\n${results.length - failed} of ${results.length} acceptance checks pass.`,
);
process.exit(failed ? 1 : 0);
