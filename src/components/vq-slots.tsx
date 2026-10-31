"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  slotCopy,
  spinSportTicket,
  ticketKey,
  type SlotLeg,
} from "@/lib/vq-slots";
import { liveSports, SPORTS, type Sport } from "@/lib/sports";
import type { SportPage } from "@/lib/sport-contract";

import {
  marketSlotPool,
  sportSlotPool,
  slotFreshnessMs,
  type SlotGame,
  type SlotObservation,
} from "@/lib/slot-markets";

/** NFL and NBA read their own FanDuel snapshots; NHL and college basketball read sports_slate. */
async function loadPool(sport: Sport, now: number): Promise<SlotLeg[]> {
  if (sport === "nhl" || sport === "ncaab") {
    const r = await supabase.rpc("sports_slate", { p_sport: sport, p_days: 7 });
    if (r.error || r.data?.version !== 1)
      throw new Error("The market board could not load. Please retry.");
    return sportSlotPool(r.data as SportPage, sport, now);
  }
  const nba = sport === "nba";
  const { data: games, error } = nba
    ? await supabase
        .from("nba_games")
        .select("id,home_team,away_team,kickoff:tipoff")
        .eq("season_type", 2)
        .gt("tipoff", new Date(now).toISOString())
        .lte("tipoff", new Date(now + 7 * slotFreshnessMs).toISOString())
        .order("tipoff")
    : await supabase
        .from("games")
        .select("id,home_team,away_team,kickoff")
        .gt("kickoff", new Date(now).toISOString())
        .lte("kickoff", new Date(now + 7 * slotFreshnessMs).toISOString())
        .order("kickoff");
  if (error) throw new Error("Upcoming games could not load. Please retry.");
  const slate = (games || []) as SlotGame[];
  const snapshots = await Promise.all(
    slate.map(async (game) => {
      const response = await (
        nba
          ? supabase
              .from("nba_observations")
              .select("id,game_id,source,observed_at,recorded_at,payload")
              .eq("game_id", game.id)
              .in("kind", ["odds", "prop"])
          : supabase
              .from("source_observations")
              .select("id,game_id,source,observed_at,recorded_at,payload")
              .eq("game_id", game.id)
              .eq("kind", "odds")
      )
        .eq("payload->>book", "FanDuel")
        .gte("observed_at", new Date(now - slotFreshnessMs).toISOString())
        .order("observed_at", { ascending: false })
        .limit(200);
      if (response.error)
        throw new Error("The market board could not load. Please retry.");
      return (response.data || []) as SlotObservation[];
    }),
  );
  return marketSlotPool(slate, snapshots.flat(), now, nba ? "nba" : "nfl");
}

export default function VqSlots() {
  // Pick the sport first; the machine only draws from that sport's current markets.
  const [sport, setSport] = useState<Sport>("nfl");
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
        const rows = await loadPool(sport, Date.now());
        if (live) setPool(rows);
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
    const poll = setInterval(load, 60000);
    return () => {
      clearInterval(poll);
      live = false;
    };
  }, [refresh, sport]);
  function pick(next: Sport) {
    if (next === sport || lock.current) return;
    // A ticket never mixes sports: clear the board, the last ticket and its history.
    setSport(next);
    setPool([]);
    setTicket([]);
    setCopied(false);
    previous.current = new Set();
    dialog.current?.close();
  }
  function spin() {
    if (lock.current || loading) return;
    try {
      const result = spinSportTicket(sport, pool, previous.current);
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
      <div className="vq-slot-sports" role="radiogroup" aria-label="Sport">
        {liveSports().map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={sport === key}
            className={sport === key ? "is-active" : ""}
            disabled={busy}
            onClick={() => pick(key)}
          >
            {SPORTS[key].label}
          </button>
        ))}
      </div>
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
          {SPORTS[sport].label} · {new Set(pool.map((r) => r.game_id)).size}{" "}
          games · {pool.length} sourced selections. No stakes.
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
        <span className="eyebrow">
          {SPORTS[sport].label} · EIGHT REELS · ONE WILD TICKET
        </span>
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
            These are randomly drawn FanDuel market snapshots, not analyst
            selections. Markets may have changed since collection. No combined
            odds, payout or win probability is claimed.
          </p>
        </details>
      </dialog>
    </section>
  );
}
