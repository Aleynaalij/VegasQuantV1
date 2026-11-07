"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { onUserChange } from "@/lib/auth-user";
import { fearSchedule } from "@/lib/vegas-fear-reader";
import type { FearEvent } from "@/lib/vegas-fear";
import {
  diagnosticSignedIn,
  runFearTesterDiagnostic,
} from "./fear-tester-diagnostic-data";

type Sport = "nfl" | "nba";
type Result = Awaited<ReturnType<typeof runFearTesterDiagnostic>>;
const label = (event: FearEvent) => `${event.away} at ${event.home}`;

export default function FearTesterDiagnostic() {
  const [sport, setSport] = useState<Sport>("nfl");
  const [events, setEvents] = useState<FearEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const selected = events.find((event) => event.id === eventId);

  function cancel(message: string) {
    request.current?.abort();
    setResult(null);
    setBusy(false);
    setStatus(message);
  }

  useEffect(() => {
    const stop = onUserChange(() => {
      cancel("Evidence cleared after account change.");
      setEvents([]);
      setEventId("");
    });
    return () => {
      request.current?.abort();
      stop();
    };
  }, []);

  async function run(action: "schedule" | "diagnostic") {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setBusy(true);
    setStatus(
      action === "schedule" ? "Loading games…" : "Testing tester access…",
    );
    setResult(null);
    try {
      if (action === "schedule") {
        setEvents([]);
        setEventId("");
        if (!(await diagnosticSignedIn(signal))) {
          setStatus("Sign in to run the diagnostic.");
          return;
        }
        const schedule = await fearSchedule(sport, Date.now());
        signal.throwIfAborted();
        const upcoming = schedule.events.filter((event) => !event.tbd);
        setEvents(upcoming);
        setStatus(
          upcoming.length ? "Choose an event." : "No eligible upcoming events.",
        );
      } else if (selected) {
        const next = await runFearTesterDiagnostic(
          { ...selected, sport },
          signal,
        );
        signal.throwIfAborted();
        setResult(next);
        setStatus(
          next.state === "signed-out"
            ? "Sign in to run the diagnostic."
            : "Diagnostic complete.",
        );
      }
    } catch {
      if (!signal.aborted) setStatus("Diagnostic unavailable. Try again.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: "46rem", margin: "2rem auto", padding: "1rem" }}>
      <h1>Fear tester diagnostic</h1>
      <p>
        Preview only. Results describe the scoped tester path for your current
        session.
      </p>
      <p>
        <Link href="/membership">Sign in or manage your session</Link>
      </p>
      <label htmlFor="diagnostic-sport">Sport</label>{" "}
      <select
        id="diagnostic-sport"
        value={sport}
        onChange={(event) => {
          cancel("");
          setSport(event.target.value === "nba" ? "nba" : "nfl");
          setEvents([]);
          setEventId("");
        }}
      >
        <option value="nfl">NFL</option>
        <option value="nba">NBA</option>
      </select>{" "}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("schedule")}
      >
        Load games
      </button>
      {events.length > 0 && (
        <p>
          <label htmlFor="diagnostic-event">Event</label>{" "}
          <select
            id="diagnostic-event"
            value={eventId}
            onChange={(event) => {
              cancel("");
              setEventId(event.target.value);
            }}
          >
            <option value="">Choose an event</option>
            {events.map((event) => (
              <option value={event.id} key={event.id}>
                {label(event)}
              </option>
            ))}
          </select>{" "}
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => void run("diagnostic")}
          >
            Run diagnostic
          </button>
        </p>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => cancel("Read cancelled. Evidence cleared.")}
        >
          Cancel read
        </button>
      )}
      <p role="status">{status}</p>
      {result?.state === "complete" && selected && (
        <section aria-label="Tester evidence">
          <h2>
            {sport.toUpperCase()} · {label(selected)}
          </h2>
          <ul>
            {result.eligibility.map(({ feature, allowed }) => (
              <li key={feature}>
                {feature} eligibility:{" "}
                {allowed === null ? "unavailable" : String(allowed)}
              </li>
            ))}
            {result.probes.map((probe) => (
              <li key={probe.label}>
                {probe.label}:{" "}
                {probe.result === "ok" ? `${probe.rows} rows` : probe.result}
              </li>
            ))}
          </ul>
          {result.history && (
            <dl>
              <dt>Fear paginated history</dt>
              <dd>
                {result.history.rows} unique quote rows · {result.history.books}{" "}
                books · {result.history.markets} markets
              </dd>
              <dd>
                {result.history.rows > 250
                  ? "More than one page of unique rows"
                  : "250 or fewer unique rows"}
              </dd>
              <dd>
                {result.history.marketPartial
                  ? "Quote coverage partial"
                  : "Quote read complete"}
              </dd>
              <dd>
                {result.history.reports} injury reports ·{" "}
                {result.history.injuriesPartial ? "partial" : "complete"}
              </dd>
            </dl>
          )}
        </section>
      )}
    </main>
  );
}
