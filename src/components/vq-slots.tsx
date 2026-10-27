"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { slotCopy, spinTicket, ticketKey, type SlotLeg } from "@/lib/vq-slots";

export default function VqSlots() {
  const [pool, setPool] = useState<SlotLeg[]>([]),
    [ticket, setTicket] = useState<SlotLeg[]>([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const [pull, setPull] = useState(0),
    [copied, setCopied] = useState(false),
    [refresh, setRefresh] = useState(0);
  const previous = useRef<Set<string>>(new Set()),
    start = useRef<number | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useRef(false),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => setRefresh((n) => n + 1));
    return () => {
      subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      setNotice("");
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error("Sign in to spin VQ Slots.");
        const { data, error } = await supabase
          .from("published_legs")
          .select(
            "leg_key,name,market,matchup,game_id,expires_at,kind,result,published_at,copy_text",
          )
          .gt("expires_at", new Date().toISOString())
          .is("result", null)
          .order("published_at", { ascending: false })
          .limit(1000);
        if (error)
          throw new Error("The selection board could not load. Please retry.");
        const rows = (data ?? []) as SlotLeg[];
        const ids = [
          ...new Set(
            rows
              .map((r) => r.game_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (!ids.length) {
          if (live) setPool([]);
          return;
        }
        const games = await supabase
          .from("games")
          .select("id,kickoff")
          .in("id", ids)
          .gt("kickoff", new Date().toISOString());
        if (games.error)
          throw new Error(
            "Upcoming game times could not be verified. Please retry.",
          );
        const kickoffs = new Map(
          (games.data ?? []).map((g) => [g.id, Date.parse(g.kickoff)]),
        );
        const verified = rows
          .filter((r) => kickoffs.has(r.game_id!))
          .map((r) => ({
            ...r,
            expires_at: new Date(
              Math.min(Date.parse(r.expires_at), kickoffs.get(r.game_id!)!),
            ).toISOString(),
          }));
        if (live) setPool(verified);
      } catch (e) {
        if (live) {
          setPool([]);
          setNotice(
            e instanceof Error ? e.message : "Could not load selections.",
          );
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [refresh]);
  function spin() {
    if (lock.current || loading) return;
    try {
      const result = spinTicket(pool, previous.current);
      lock.current = true;
      setBusy(true);
      setNotice("");
      setCopied(false);
      setTicket([]);
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      timer.current = setTimeout(
        () => {
          const now = Date.now();
          if (result.some((r) => Date.parse(r.expires_at) <= now)) {
            setNotice(
              "A game started during the spin. Refresh the board and try again.",
            );
          } else {
            previous.current.add(ticketKey(result));
            setTicket(result);
            dialog.current?.showModal();
          }
          lock.current = false;
          setBusy(false);
          setPull(0);
        },
        reduced ? 50 : 2200,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Spin unavailable.");
    }
  }
  async function copy() {
    if (ticket.some((r) => Date.parse(r.expires_at) <= Date.now())) {
      setNotice("This ticket has expired. Close it and refresh the board.");
      return;
    }
    try {
      await navigator.clipboard.writeText(slotCopy(ticket));
      setCopied(true);
    } catch {
      setNotice("Copy unavailable. Select the ticket text below and copy it.");
    }
  }
  return (
    <section className="vq-slots" aria-labelledby="slots-title">
      <header>
        <span className="eyebrow">VEGAS QUANT PRESENTS</span>
        <h1 id="slots-title">VQ SLOTS</h1>
        <p>Pull. Reveal. Take a wild shot.</p>
      </header>
      <div
        className={`vq-machine ${busy ? "is-spinning" : ""}`}
        aria-busy={busy}
      >
        <div className="vq-marquee">
          <span>✦</span> THE HAIL MARY MACHINE <span>✦</span>
        </div>
        <div className="vq-reels" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              className="vq-reel"
              key={i}
              style={{ "--reel": i } as React.CSSProperties}
            >
              <div className="vq-reel-strip">
                <b>{!busy && ticket[i] ? ticket[i].name : "VQ"}</b>
                <b>✦</b>
                <b>VIII</b>
                <b>♦</b>
                <b>VQ</b>
              </div>
              <small>LEG {i + 1}</small>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="vq-lever"
          aria-label="Pull lever to generate eight random legs"
          disabled={busy || loading}
          style={{ "--pull": `${pull}px` } as React.CSSProperties}
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null)
              setPull(Math.max(0, Math.min(90, e.clientY - start.current)));
          }}
          onPointerUp={() => {
            const pulled = pull >= 45;
            start.current = null;
            setPull(0);
            if (pulled) spin();
          }}
          onPointerCancel={() => {
            start.current = null;
            setPull(0);
          }}
          onClick={spin}
        >
          <span className="vq-lever-ball" />
          <span className="vq-lever-shaft" />
          <span className="vq-lever-label">PULL</span>
        </button>
        <button
          type="button"
          className="vq-spin"
          onClick={spin}
          disabled={busy || loading}
        >
          {loading
            ? "LOADING THE BOARD…"
            : busy
              ? "REELS RUNNING…"
              : "SPIN 8 LEGS"}
        </button>
        <p className="vq-machine-note">
          No credits. No stakes. Just a random ticket.
        </p>
      </div>
      <p className="vq-slots-disclosure">
        Entertainment only. Random selections, not model picks. Eight reels do
        not mean eight likely winners. Availability, correlation and prices need
        your review.
      </p>
      <p role="status">{notice}</p>
      <button
        type="button"
        className="vq-refresh"
        onClick={() => setRefresh((n) => n + 1)}
        disabled={busy || loading}
      >
        Refresh selection board
      </button>
      <dialog
        ref={dialog}
        className="vq-ticket"
        aria-labelledby="vq-ticket-title"
        onCancel={() => setCopied(false)}
      >
        <button
          className="vq-close"
          aria-label="Close ticket"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        <span className="eyebrow">EIGHT REELS · ONE WILD TICKET</span>
        <h2 id="vq-ticket-title">HAIL MARY UNLOCKED</h2>
        <p>Random draw · not a winning ticket</p>
        <ol>
          {ticket.map((r) => (
            <li key={r.leg_key}>
              <strong>{r.name}</strong>
              <span>{r.market}</span>
              <small>{r.matchup}</small>
            </li>
          ))}
        </ol>
        <button type="button" className="vq-spin" onClick={copy}>
          {copied ? "COPIED" : "COPY 8 LEGS"}
        </button>
        <button
          className="vq-refresh"
          onClick={() => {
            dialog.current?.close();
            spin();
          }}
        >
          Close & spin again
        </button>
        <details>
          <summary>Ticket text & availability</summary>
          <textarea
            readOnly
            value={slotCopy(ticket)}
            aria-label="Ticket text"
          />
          <p>
            These are collected analyst targets; a sportsbook may not offer
            every market. No combined odds, payout or win probability is
            claimed.
          </p>
        </details>
      </dialog>
    </section>
  );
}
