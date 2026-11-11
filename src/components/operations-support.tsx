"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { onUserChange } from "@/lib/auth-user";
import {
  operationsFeedMaxAgeMinutes,
  operationsFeedSample,
  type OperationsFeedHealth,
} from "@/lib/operations-feed-health";
import { supabase } from "@/lib/supabase";
import {
  operationFeatures,
  operationSymptoms,
  type OperationInput,
  type OperationResult,
} from "@/lib/operations-support";

type ErrorState = Exclude<
  OperationResult,
  { state: "ready" | "submitted" }
>["state"];
type Queue = Extract<OperationResult, { tickets: unknown }>;
type Detail = Extract<OperationResult, { ticket: unknown }>;
const messages: Record<ErrorState, string> = {
  unauthenticated: "Sign in to continue.",
  forbidden: "This session does not have the required access.",
  invalid: "Check your selections and try again.",
  not_found: "The report is no longer available.",
  conflict: "This report changed. Refresh before trying again.",
  limit: "You reached the reporting limit. Try again in an hour.",
  unavailable: "The support queue is unavailable. Try again later.",
};
const featureNames = {
  account: "Account",
  research: "Research",
  zone: "The Zone",
  records: "Records",
  other: "Other",
};
const symptomNames = {
  unavailable: "Won’t open or load",
  incorrect: "Shows incorrect information",
  slow: "Responds slowly",
  other: "Other malfunction",
};
const statusNames = {
  new: "New",
  in_review: "In review",
  resolved: "Resolved",
};
const actionNames = {
  submitted: "Submitted",
  triaged: "Marked in review",
  resolved: "Marked resolved",
};
const utc = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const feedStatusNames: Record<OperationsFeedHealth["status"], string> = {
  current: "Current",
  stale: "Stale",
  unavailable: "Unavailable",
  failed: "Failed",
  partial: "Partial",
  no_events: "No upcoming events",
  not_due: "Not due",
  skipped: "Skipped",
};

function utcTime(value: string) {
  return <time dateTime={value}>{utc.format(new Date(value))} UTC</time>;
}

async function operation(input: OperationInput): Promise<OperationResult> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return { state: "unauthenticated" };
    const response = await fetch("/api/operations", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(input),
    });
    return (await response.json()) as OperationResult;
  } catch {
    return { state: "unavailable" };
  }
}

export function OperationsQueue() {
  const [history, setHistory] = useState(false);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);

  async function run(input: OperationInput) {
    const request = ++sequence.current;
    if (input.action === "list") {
      if (!input.cursor) setQueue(null);
      setDetail(null);
    } else if (input.action === "detail") setDetail(null);
    setLoading(true);
    setNotice("");
    const result = await operation(input);
    if (request !== sequence.current) return;
    setLoading(false);
    if (result.state === "ready" && "tickets" in result) {
      setQueue((previous) =>
        input.action === "list" && input.cursor && previous
          ? { ...result, tickets: [...previous.tickets, ...result.tickets] }
          : result,
      );
    } else if (result.state === "ready" && "ticket" in result) {
      setDetail(result);
      setQueue(
        (prev) =>
          prev && {
            ...prev,
            tickets: prev.tickets.flatMap((t) =>
              t.id !== result.ticket.id
                ? [t]
                : (result.ticket.status === "resolved") === history
                  ? [result.ticket]
                  : [],
            ),
          },
      );
    } else if (result.state !== "submitted") {
      if (result.state === "forbidden" || result.state === "unauthenticated") {
        setQueue(null);
        setDetail(null);
      }
      setNotice(
        result.state === "forbidden"
          ? "Operations requires a current administrator session with two-step verification."
          : messages[result.state],
      );
    }
  }

  useEffect(() => {
    void run({ action: "list" });
    const stop = onUserChange(() => {
      ++sequence.current;
      setQueue(null);
      setDetail(null);
      setHistory(false);
      setLoading(false);
      setNotice("Account changed. Check access again.");
    });
    return () => {
      ++sequence.current;
      stop();
    };
  }, []);
  useEffect(() => {
    if (detail?.ticket.id) detailHeading.current?.focus();
  }, [detail?.ticket.id]);

  return (
    <article className="vq-policy">
      <h1>Operations</h1>
      {loading && (
        <p role="status">{queue ? "Loading report…" : "Checking access…"}</p>
      )}
      {notice && <p role="alert">{notice}</p>}
      <div className="vq-help-actions">
        <button
          type="button"
          disabled={loading}
          onClick={() => void run({ action: "list", history })}
        >
          {queue ? "Refresh queue" : "Check access again"}
        </button>
      </div>
      {queue && (
        <>
          <section aria-label="Support queue">
            <h2>Support queue</h2>
            <div className="vq-help-actions">
              {[false, true].map((resolved) => (
                <button
                  key={String(resolved)}
                  type="button"
                  disabled={loading}
                  aria-pressed={history === resolved}
                  onClick={() => {
                    setHistory(resolved);
                    void run({ action: "list", history: resolved });
                  }}
                >
                  {resolved ? "Resolved history" : "Open reports"}
                </button>
              ))}
            </div>
            <p>
              {history ? "Resolved reports" : "Open reports"}, newest first.
              Times are UTC.
            </p>
            {!queue.tickets.length && (
              <p>{history ? "No resolved reports." : "No open reports."}</p>
            )}
            <ul>
              {queue.tickets.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void run({ action: "detail", id: ticket.id })
                    }
                  >
                    {featureNames[ticket.feature]} ·{" "}
                    {symptomNames[ticket.symptom]} ·{" "}
                    {statusNames[ticket.status]}
                  </button>{" "}
                  <time dateTime={ticket.created_at}>
                    {utc.format(new Date(ticket.created_at))} UTC
                  </time>
                </li>
              ))}
            </ul>
            {queue.next && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  if (queue.next)
                    void run({ action: "list", history, cursor: queue.next });
                }}
              >
                Load older reports
              </button>
            )}
          </section>
          {detail && (
            <section aria-label="Report details">
              <h2 ref={detailHeading} tabIndex={-1}>
                Report details
              </h2>
              <p>
                {featureNames[detail.ticket.feature]} ·{" "}
                {symptomNames[detail.ticket.symptom]} ·{" "}
                {statusNames[detail.ticket.status]}
              </p>
              <h3>Update history</h3>
              <ol>
                {detail.events.map((event) => (
                  <li key={event.action}>
                    {actionNames[event.action]} ·{" "}
                    <time dateTime={event.created_at}>
                      {utc.format(new Date(event.created_at))} UTC
                    </time>
                  </li>
                ))}
              </ol>
              {detail.ticket.status !== "resolved" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const { id, status } = detail.ticket;
                    if (status !== "resolved")
                      void run({ action: "triage", id, expected: status });
                  }}
                >
                  {detail.ticket.status === "new"
                    ? "Mark in review"
                    : "Resolve report"}
                </button>
              )}
            </section>
          )}
          <section aria-labelledby="operations-release-heading">
            <h2 id="operations-release-heading">
              Deployment serving this page
            </h2>
            {queue.release ? (
              <>
                <p>
                  {queue.release.environment === "production"
                    ? "Production"
                    : "Preview"}{" "}
                  · Vercel
                  {" · "}Observed{" "}
                  {utc.format(new Date(queue.release.observedAt))} UTC
                </p>
                <p style={{ overflowWrap: "anywhere" }}>
                  Deployment: <code>{queue.release.deploymentId}</code>
                </p>
                <p>
                  {queue.release.commit ? (
                    <a
                      href={`https://github.com/Aleynaalij/VegasQuantV1/commit/${queue.release.commit}`}
                    >
                      GitHub commit{" "}
                      <code>{queue.release.commit.slice(0, 12)}</code>
                    </a>
                  ) : (
                    "GitHub commit unavailable."
                  )}
                </p>
              </>
            ) : (
              <p>Deployment identity unavailable for this environment.</p>
            )}
            <p>
              <a href="https://vercel.com/goatq2s-projects/vegas-quant-v1/deployments">
                Open deployment history in Vercel
              </a>
            </p>
          </section>
          <section aria-labelledby="operations-health-heading">
            <h2 id="operations-health-heading">NFL feed health</h2>
            {queue.feedHealth ? (
              <>
                <p>Checked {utcTime(queue.feedHealth.checkedAt)}.</p>
                <ul>
                  {queue.feedHealth.feeds.map((feed) => (
                    <li key={feed.provider}>
                      <strong>{feed.provider}</strong> ·{" "}
                      {feedStatusNames[feed.status]}
                      {feed.stale && feed.status !== "stale"
                        ? " · Last check stale"
                        : ""}
                      <div>
                        Last check:{" "}
                        {feed.latestAt ? utcTime(feed.latestAt) : "Unavailable"}
                      </div>
                      <div>
                        Last successful run:{" "}
                        {feed.lastSuccessAt
                          ? utcTime(feed.lastSuccessAt)
                          : "Not found in recent runs"}
                      </div>
                    </li>
                  ))}
                </ul>
                <p>
                  Checks older than {operationsFeedMaxAgeMinutes} minutes are
                  stale. Success is based on the latest {operationsFeedSample}{" "}
                  recorded runs per feed. These checks do not verify current
                  quotes, game coverage, settlement, or other sports.
                </p>
              </>
            ) : (
              <p>Feed health summary unavailable.</p>
            )}
            <p>
              <Link href="/admin/feeds">Open existing Feed Health</Link>.
            </p>
          </section>
          <section aria-label="Operational sources">
            <h2>Other operational sources</h2>
            <p>Traffic metrics unavailable. Support email not connected.</p>
          </section>
        </>
      )}
    </article>
  );
}

export function MalfunctionReport() {
  const [feature, setFeature] = useState("");
  const [symptom, setSymptom] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState("");
  const retryKey = useRef<string | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const stop = onUserChange(() => {
      ++sequence.current;
      retryKey.current = null;
      setFeature("");
      setSymptom("");
      setBusy(false);
      setReceipt("");
      setNotice("Account changed. Select the report details again.");
    });
    return () => {
      ++sequence.current;
      stop();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedFeature = operationFeatures.find((f) => f === feature);
    const selectedSymptom = operationSymptoms.find((s) => s === symptom);
    if (busy || !selectedFeature || !selectedSymptom) return;
    const request = ++sequence.current;
    setBusy(true);
    setNotice("");
    const id = (retryKey.current ??= crypto.randomUUID());
    const result = await operation({
      action: "submit",
      id,
      feature: selectedFeature,
      symptom: selectedSymptom,
    });
    if (request !== sequence.current) return;
    setBusy(false);
    if (result.state === "submitted") {
      setReceipt(result.id);
      retryKey.current = null;
      setFeature("");
      setSymptom("");
    } else
      setNotice(
        result.state === "ready"
          ? messages.unavailable
          : messages[result.state],
      );
  }
  return (
    <article className="vq-policy">
      <h1>Report a malfunction</h1>
      <p>
        Choose the feature and symptom. A signed-in, eligible session is
        required. Reports do not send email.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy}>
          <legend>Report details</legend>
          <p>
            <label>
              Feature{" "}
              <select
                required
                value={feature}
                onChange={(event) => {
                  retryKey.current = null;
                  setReceipt("");
                  setFeature(event.target.value);
                }}
              >
                <option value="">Choose a feature</option>
                {operationFeatures.map((item) => (
                  <option key={item} value={item}>
                    {featureNames[item]}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <p>
            <label>
              Symptom{" "}
              <select
                required
                value={symptom}
                onChange={(event) => {
                  retryKey.current = null;
                  setReceipt("");
                  setSymptom(event.target.value);
                }}
              >
                <option value="">Choose a symptom</option>
                {operationSymptoms.map((item) => (
                  <option key={item} value={item}>
                    {symptomNames[item]}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <button type="submit">
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </fieldset>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {receipt && (
        <p role="status">
          Report received. Reference{" "}
          <code style={{ overflowWrap: "anywhere" }}>{receipt}</code>.
        </p>
      )}
      <p>
        <Link href="/support">Back to Help &amp; Support</Link>
      </p>
    </article>
  );
}
