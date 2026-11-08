"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  POLL_MAX_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  isPollState,
  pollPercents,
  type PollDraft,
  type PollState,
} from "@/lib/zone-poll";
import "@/app/zone-poll.css";

/** Poll states for the posts on screen, loaded in one batch, plus voting with an optimistic update. */
export function useZonePolls(ids: string[], uid: string | null) {
  const [states, setStates] = useState<Record<string, PollState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const key = ids.slice(0, 100).join(",");
  const generation = useRef(0);
  useEffect(() => {
    const posts = key ? key.split(",") : [];
    const run = ++generation.current;
    if (!uid || !posts.length) {
      setStates({});
      return;
    }
    void supabase.rpc("community_poll_states", { p_posts: posts }).then((r) => {
      if (run !== generation.current || r.error || !Array.isArray(r.data))
        return;
      setStates(
        Object.fromEntries(
          r.data.filter(isPollState).map((s) => [s.post_id, s]),
        ),
      );
    });
  }, [key, uid]);
  const vote = useCallback(
    async (post: string, option: number) => {
      const prev = states[post];
      if (!prev || busy) return;
      const next = prev.mine === option ? null : option;
      const counts = prev.counts.slice();
      if (prev.mine !== null) counts[prev.mine]--;
      if (next !== null) counts[next]++;
      setBusy(post);
      setStates((all) => ({
        ...all,
        [post]: {
          ...prev,
          counts,
          mine: next,
          total:
            prev.total +
            (next === null ? -1 : 0) +
            (prev.mine === null ? 1 : 0),
        },
      }));
      const r = await supabase.rpc("set_community_poll_vote", {
        p_post: post,
        p_option: next,
      });
      setBusy(null);
      setStates((all) => ({
        ...all,
        [post]: !r.error && isPollState(r.data) ? r.data : prev,
      }));
      return !r.error;
    },
    [states, busy],
  );
  return { states, vote, busy };
}

export function ZonePoll({
  state,
  onVote,
  busy,
}: {
  state: PollState;
  onVote: (option: number) => void;
  busy: boolean;
}) {
  const percents = pollPercents(state.counts);
  const voted = state.mine !== null;
  return (
    <fieldset
      className={`zone-poll ${voted ? "is-voted" : ""}`}
      aria-busy={busy}
    >
      <legend>
        <BarChart3 size={16} aria-hidden="true" /> {state.question}
      </legend>
      {state.options.map((option, i) => (
        <button
          key={i}
          type="button"
          className={`zone-poll-option ${state.mine === i ? "is-mine" : ""}`}
          aria-pressed={state.mine === i}
          disabled={busy}
          onClick={() => onVote(i)}
          style={
            voted
              ? ({
                  "--zone-poll-share": `${percents[i]}%`,
                } as React.CSSProperties)
              : undefined
          }
        >
          <span className="zone-poll-label">{option}</span>
          {voted ? (
            <span className="zone-poll-percent">{percents[i]}%</span>
          ) : null}
        </button>
      ))}
      <small className="zone-poll-meta">
        {state.total} {state.total === 1 ? "vote" : "votes"}
        {voted
          ? " · tap your choice again to remove your vote"
          : " · tap to vote and see results"}
      </small>
    </fieldset>
  );
}

export function PollComposer({
  draft,
  onChange,
  onRemove,
}: {
  draft: PollDraft;
  onChange: (d: PollDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="zone-poll-composer">
      <div className="zone-poll-composer-head">
        <label htmlFor="zone-poll-question">Poll question</label>
        <button type="button" className="zone-chip" onClick={onRemove}>
          Remove poll
        </button>
      </div>
      <input
        id="zone-poll-question"
        value={draft.question}
        maxLength={POLL_QUESTION_MAX}
        placeholder="Who wins tonight?"
        onChange={(e) => onChange({ ...draft, question: e.target.value })}
      />
      {draft.options.map((option, i) => (
        <div className="zone-poll-composer-option" key={i}>
          <label className="sr-only" htmlFor={`zone-poll-option-${i}`}>
            Option {i + 1}
          </label>
          <input
            id={`zone-poll-option-${i}`}
            value={option}
            maxLength={POLL_OPTION_MAX}
            placeholder={`Option ${i + 1}`}
            onChange={(e) =>
              onChange({
                ...draft,
                options: draft.options.map((o, j) =>
                  j === i ? e.target.value : o,
                ),
              })
            }
          />
          {draft.options.length > 2 ? (
            <button
              type="button"
              className="zone-poll-remove"
              aria-label={`Remove option ${i + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  options: draft.options.filter((_, j) => j !== i),
                })
              }
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
      {draft.options.length < POLL_MAX_OPTIONS ? (
        <button
          type="button"
          className="zone-chip"
          onClick={() =>
            onChange({ ...draft, options: [...draft.options, ""] })
          }
        >
          <Plus size={14} aria-hidden="true" /> Add option
        </button>
      ) : null}
    </div>
  );
}
