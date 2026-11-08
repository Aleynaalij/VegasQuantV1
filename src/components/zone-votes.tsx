"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  applyVote,
  formatScore,
  isVoteState,
  nextVote,
  type Vote,
  type VoteState,
} from "@/lib/zone-votes";
import "@/app/zone-votes.css";

/**
 * Vote states for the posts on screen. `refresh` is any value that changes on every feed load (the
 * rows array), so other members' votes appear on each refresh and a failed read is retried. Results
 * that arrive after the account changed are discarded.
 */
export function useZoneVotes(
  ids: string[],
  uid: string | null,
  refresh: unknown,
) {
  const [states, setStates] = useState<Record<string, VoteState>>({});
  const [pending, setPending] = useState<string | null>(null);
  const account = useRef(uid);
  const generation = useRef(0);
  const key = ids.slice(0, 100).join(",");
  useEffect(() => {
    if (account.current !== uid) {
      account.current = uid;
      generation.current++;
      setStates({});
      setPending(null);
    }
  }, [uid]);
  useEffect(() => {
    const posts = key ? key.split(",") : [];
    const run = ++generation.current;
    if (!uid || !posts.length) return;
    void supabase.rpc("community_vote_states", { p_posts: posts }).then((r) => {
      if (
        run !== generation.current ||
        account.current !== uid ||
        r.error ||
        !Array.isArray(r.data)
      )
        return;
      setStates(
        Object.fromEntries(
          r.data.filter(isVoteState).map((s) => [s.post_id, s]),
        ),
      );
    });
  }, [key, uid, refresh]);
  const vote = useCallback(
    async (post: string, tapped: Vote) => {
      const prev = states[post];
      if (!uid || !prev || pending) return;
      const owner = uid;
      const next = nextVote(prev.mine, tapped);
      setPending(post);
      setStates((all) => ({ ...all, [post]: applyVote(prev, next) }));
      const r = await supabase.rpc("set_community_post_vote", {
        p_post: post,
        p_value: next ?? 0,
      });
      if (account.current !== owner) return true; // signed out or switched: drop the stale answer
      setPending(null);
      setStates((all) => ({
        ...all,
        [post]: !r.error && isVoteState(r.data) ? r.data : prev,
      }));
      return !r.error;
    },
    [states, pending, uid],
  );
  return { states, vote, pending };
}

export function VoteControl({
  state,
  busy,
  onVote,
}: {
  state: VoteState;
  busy: boolean;
  onVote: (v: Vote) => void;
}) {
  const tone = state.mine === 1 ? "is-up" : state.mine === -1 ? "is-down" : "";
  return (
    <div
      className={`zone-vote ${tone}`}
      role="group"
      aria-label={`Post score ${state.score}`}
    >
      <button
        type="button"
        className="zone-vote-up"
        aria-pressed={state.mine === 1}
        aria-label={state.mine === 1 ? "Remove up-vote" : "Up-vote"}
        disabled={busy}
        onClick={() => onVote(1)}
      >
        <ArrowBigUp
          size={22}
          fill={state.mine === 1 ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
      <span className="zone-vote-score" aria-live="polite">
        {formatScore(state.score)}
      </span>
      <button
        type="button"
        className="zone-vote-down"
        aria-pressed={state.mine === -1}
        aria-label={state.mine === -1 ? "Remove down-vote" : "Down-vote"}
        disabled={busy}
        onClick={() => onVote(-1)}
      >
        <ArrowBigDown
          size={22}
          fill={state.mine === -1 ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
