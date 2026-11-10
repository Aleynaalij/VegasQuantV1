"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import type { NbaGame } from "@/lib/nba-board";
import type { NbaEditorialPick } from "@/lib/nba-editorial";
import {
  gameSelectionCards,
  loadGameSelections,
  type GameSelectionsResult,
} from "@/lib/nba-game-selections";
import NbaEditorialCard from "./nba-editorial-card";

type Snapshot = { gameId: string; epoch: number; result: GameSelectionsResult };

/** One game-specific publication surface, independent of market-research availability. */
export default function NbaGameSelections({
  game,
  allowed,
  now,
}: {
  game: NbaGame;
  allowed: boolean;
  now: number;
}) {
  const heading = useId();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let live = true,
      busy = false;
    setSnapshot(null);
    if (!allowed) return;
    const controller = new AbortController();
    async function load() {
      if (busy) return;
      busy = true;
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(15000),
      ]);
      const result = await loadGameSelections(
        game.id,
        async () => {
          const access = await supabase
            .rpc("membership_status")
            .abortSignal(signal);
          if (access.error) throw access.error;
          return live && access.data?.allowed === true;
        },
        async (gameId, offset, size) => {
          const response = await supabase
            .from("nba_editorial_picks")
            .select(
              "id,publication_key,game_id,player,market,direction,line,odds,book,rationale,risk,unknowns,sources,evidence_sources:evidence->source_files,supersedes_id,published_at,expires_at,quote_observed_at,quote_recorded_at,quote_source_url",
            )
            .eq("game_id", gameId)
            .order("published_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + size - 1)
            .abortSignal(signal);
          if (response.error) throw response.error;
          return (response.data || []) as unknown as NbaEditorialPick[];
        },
      );
      busy = false;
      if (live) setSnapshot({ gameId: game.id, epoch, result });
    }
    void load();
    const stop = onUserChange(() => {
      live = false;
      controller.abort();
      setSnapshot(null);
      setEpoch((n) => n + 1);
    });
    const refresh = () => {
      setClock(Date.now());
      if (document.visibilityState !== "hidden") void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      controller.abort();
      stop();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [game.id, allowed, epoch]);
  const result =
    allowed && snapshot?.gameId === game.id && snapshot.epoch === epoch
      ? snapshot.result
      : null;
  const denied = !allowed || result?.status === "denied";
  const cards =
    result?.status === "ready" ? gameSelectionCards(result.picks, game) : [];
  return (
    <section className="nba-game-selections" aria-labelledby={heading}>
      <h2 id={heading}>VQ published selections</h2>
      <p>
        Published analyst selections for this game. Market research below is
        separate.
      </p>
      {denied ? (
        <p role="status">
          <Link href="/membership">Check research access</Link> to see published
          selections.
        </p>
      ) : !result ? (
        <p role="status">Loading published selections…</p>
      ) : result.status === "error" ? (
        <p role="alert">
          Published selections could not load.{" "}
          <button type="button" onClick={() => setEpoch((n) => n + 1)}>
            Retry selections
          </button>
        </p>
      ) : cards.length === 0 ? (
        <p role="status">No VQ selections published for this game</p>
      ) : (
        cards.map(({ pick, superseded }) => (
          <NbaEditorialCard
            key={pick.id}
            pick={pick}
            superseded={superseded}
            now={Math.max(now, clock)}
          />
        ))
      )}
    </section>
  );
}
