"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  analystCard,
  analystCopy,
  analystOpen,
  type AnalystDoubleUp,
} from "@/lib/analyst-double-up";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import GamblyLink from "./gambly-link";

const time = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
export function AnalystDoubleUpCard({ ticket }: { ticket: AnalystDoubleUp }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [ticket.id]);
  const data = analystCard(ticket);
  return (
    <article className="analyst-double-up" id={`analyst-${ticket.id}`}>
      <CasinoCard data={data} />
      <p>
        Analyst pick · {ticket.sportsbook} complete-slip price observed{" "}
        {time(ticket.observed_at)}. Prices may move.
      </p>
      <details>
        <summary>Why these legs · sources & risks</summary>
        {ticket.candidates.map((leg, index) => (
          <section key={index}>
            <h3>{leg.copy_text}</h3>
            <p>{leg.selection_gate.opportunity_case}</p>
            <p>
              <strong>Why it could lose:</strong>{" "}
              {leg.selection_gate.failure_path}
            </p>
            <p>{leg.selection_gate.game_script_review}</p>
            <p>
              <a
                href={leg.selection_gate.role_source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Workload
              </a>
              {" · "}
              <a
                href={leg.selection_gate.availability_source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Availability
              </a>
              {" · "}
              <a
                href={leg.selection_gate.history_source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Recent form
              </a>
            </p>
          </section>
        ))}
        <p>
          <strong>Whole-ticket review:</strong>{" "}
          {ticket.review.correlation_review}
        </p>
        <p>
          <strong>Shared risks:</strong> {ticket.review.failure_scenarios}
        </p>
        <p>{ticket.review.market_context}</p>
        <p>
          <strong>Unknowns:</strong> {ticket.review.material_unknowns}
        </p>
        <a href={ticket.source_url} target="_blank" rel="noopener noreferrer">
          Complete sportsbook quote
        </a>
        <p>
          Published {time(ticket.created_at)} · Pregame copying closes{" "}
          {time(ticket.expires_at)}.
        </p>
      </details>
      <div className="ruby-actions">
        <GamblyLink
          url="https://gambly.com"
          selection={analystCopy(ticket)}
          kalshiTexts={ticket.candidates.map((leg) => leg.copy_text)}
          disabled={!analystOpen(ticket, now)}
        />
        <CasinoCardDownload data={data} />
      </div>
      {!analystOpen(ticket, now) && (
        <p>Pregame copying closed. Original ticket retained.</p>
      )}
    </article>
  );
}

/** Zone keeps original tickets accessible; RLS limits reads to eligible members. */
export default function AnalystDoubleUpFeed({
  selectedId = "",
}: {
  selectedId?: string;
}) {
  const [tickets, setTickets] = useState<AnalystDoubleUp[]>([]);
  const [error, setError] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    async function refresh() {
      const version = ++epoch.current;
      const session = await supabase.auth.getSession();
      if (version !== epoch.current) return;
      if (!session.data.session) {
        setTickets([]);
        setError(false);
        return;
      }
      const query = supabase.from("nfl_analyst_double_ups").select("*");
      const result = selectedId
        ? await query.eq("id", selectedId).limit(1)
        : await query.order("created_at", { ascending: false }).limit(1);
      if (version !== epoch.current) return;
      setTickets(result.error ? [] : result.data || []);
      setError(!!result.error);
    }
    void refresh();
    const stop = onUserChange(() => {
      epoch.current++;
      setTickets([]);
      void refresh();
    });
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    const interval = setInterval(focus, 60000);
    return () => {
      epoch.current++;
      stop();
      window.removeEventListener("focus", focus);
      clearInterval(interval);
    };
  }, [selectedId]);
  return (
    <>
      {error && (
        <p role="status">Double Up could not load. Reopen this tab to retry.</p>
      )}
      {tickets.map((ticket) => (
        <AnalystDoubleUpCard key={ticket.id} ticket={ticket} />
      ))}
    </>
  );
}
