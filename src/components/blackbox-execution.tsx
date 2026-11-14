"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { dryRunExecution } from "@/lib/blackbox-execution";

type Package = {
  id: string;
  state: string;
  version: number;
  specification: Record<string, unknown>;
  evidence_digest: string | null;
  history: { version: number; action: string; recorded_at: string }[];
};

async function command(input: object, signal?: AbortSignal) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in with staging MFA.");
  const response = await fetch("/api/operations/blackbox/execution", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(input),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export function BlackboxExecution() {
  const [data, setData] = useState<{
    role: string;
    packages: Package[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void command({ action: "list" }, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice("Execution packages are unavailable for this session.");
      });
    return () => controller.abort();
  }, []);
  async function run(input: object) {
    setBusy(true);
    setNotice("");
    try {
      await command({ ...input, request: crypto.randomUUID() });
      setData(await command({ action: "list" }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }
  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void run({
      action: "propose",
      id: crypto.randomUUID(),
      version: 0,
      payload: {
        task: fields.get("task"),
        agent: fields.get("agent"),
        outcomeVersion: Number(fields.get("outcome")),
      },
    });
  }
  return (
    <section aria-label="Engineering execution">
      <h2>Engineering execution</h2>
      <p>
        SYNTHETIC · Dry run only. Repository, pull-request, merge, deployment,
        database, and policy actions are blocked.
      </p>
      {notice && <p role="status">{notice}</p>}
      {data && (
        <fieldset disabled={busy}>
          <legend>
            {data.packages.filter((p) => p.state === "approved").length}{" "}
            independently reviewed outcomes · {data.packages.length} visible
            packages
          </legend>
          {data.role === "admin" && (
            <form onSubmit={propose}>
              <label>
                Reviewed task ID <input name="task" required />
              </label>
              <label>
                Outcome version{" "}
                <input name="outcome" type="number" min="1" required />
              </label>
              <label>
                Assigned staging agent ID <input name="agent" required />
              </label>
              <button type="submit">Propose package</button>
            </form>
          )}
          {data.packages.map((p) => {
            const update = (action: string, payload: object = {}) =>
              run({ action, id: p.id, version: p.version, payload });
            return (
              <details key={p.id}>
                <summary>
                  {String(p.specification.sourceTask)} · {p.state} · version{" "}
                  {p.version}
                </summary>
                <dl>
                  {Object.entries(p.specification).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd style={{ overflowWrap: "anywhere" }}>
                        {Array.isArray(value)
                          ? value.join(" · ")
                          : String(value ?? "Unavailable")}
                      </dd>
                    </div>
                  ))}
                </dl>
                {p.evidence_digest && (
                  <p>
                    Evidence digest{" "}
                    <code style={{ overflowWrap: "anywhere" }}>
                      {p.evidence_digest}
                    </code>
                  </p>
                )}
                {data.role === "admin" && p.state === "proposed" && (
                  <button
                    type="button"
                    onClick={() =>
                      void update("authorize", { scope: "execution" })
                    }
                  >
                    Authorize dry run
                  </button>
                )}
                {data.role === "admin" &&
                  ["authorized", "acknowledged", "submitted"].includes(
                    p.state,
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        void update("revoke", {
                          reason: "Staging rollback requested",
                        })
                      }
                    >
                      Revoke execution
                    </button>
                  )}
                {(data.role === "codex" || data.role === "claude") &&
                  (p.state === "authorized" ? (
                    <button
                      type="button"
                      onClick={() => void update("acknowledge")}
                    >
                      Acknowledge
                    </button>
                  ) : (
                    p.state === "acknowledged" && (
                      <button
                        type="button"
                        onClick={() =>
                          void update(
                            "submit",
                            dryRunExecution(data.role as "codex" | "claude")
                              .evidence,
                          )
                        }
                      >
                        Submit synthetic evidence
                      </button>
                    )
                  ))}
                {data.role === "reviewer" && p.state === "submitted" && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      void update(String(f.get("decision")), {
                        digest: p.evidence_digest,
                        reason: f.get("reason"),
                      });
                    }}
                  >
                    <label>
                      Independent decision{" "}
                      <select name="decision">
                        <option value="approve">
                          Approve synthetic evidence
                        </option>
                        <option value="reject">Reject</option>
                      </select>
                    </label>
                    <label>
                      Review reason{" "}
                      <textarea name="reason" required maxLength={1500} />
                    </label>
                    <button type="submit">Record review</button>
                  </form>
                )}
                <h3>Audit history</h3>
                <ol>
                  {p.history.map((e) => (
                    <li key={e.version}>
                      {e.version} · {e.action} · {e.recorded_at}
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </fieldset>
      )}
    </section>
  );
}
