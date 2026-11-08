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
 * that arrive after the account changed are discarded, and a read that started before or during a
 * vote on a post never overwrites that post's newer state.
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
  const mutations = useRef<Record<string, number>>({});
  const inFlight = useRef<Set<string>>(new Set());
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
    const started = { ...mutations.current };
    void supabase.rpc("community_vote_states", { p_posts: posts }).then((r) => {
      if (
        run !== generation.current ||
        account.current !== uid ||
        r.error ||
        !Array.isArray(r.data)
      )
        return;
      const fresh = r.data.filter(isVoteState);
      setStates((all) => {
        const next: Record<string, VoteState> = {};
        for (const s of fresh) {
          const stale =
            inFlight.current.has(s.post_id) ||
            (mutations.current[s.post_id] ?? 0) !== (started[s.post_id] ?? 0);
          next[s.post_id] = stale && all[s.post_id] ? all[s.post_id] : s;
        }
        return next;
      });
    });
  }, [key, uid, refresh]);
  const vote = useCallback(
    async (post: string, tapped: Vote) => {
      const prev = states[post];
      if (!uid || !prev || pending) return;
      const owner = uid;
      const next = nextVote(prev.mine, tapped);
      setPending(post);
      mutations.current[post] = (mutations.current[post] ?? 0) + 1;
      inFlight.current.add(post);
      setStates((all) => ({ ...all, [post]: applyVote(prev, next) }));
      const r = await supabase.rpc("set_community_post_vote", {
        p_post: post,
        p_value: next ?? 0,
      });
      inFlight.current.delete(post);
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
