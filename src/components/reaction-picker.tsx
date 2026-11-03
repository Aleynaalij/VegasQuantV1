"use client";
import { useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  nextReaction,
  reactionState,
  REACTION_TYPES,
  type ReactionState,
  type ReactionType,
} from "@/lib/community-reaction-contracts";

const LABEL: Record<ReactionType, { emoji: string; name: string }> = {
  heart: { emoji: "❤️", name: "Like" },
  celebrate: { emoji: "🎉", name: "Celebrate" },
  fire: { emoji: "🔥", name: "Fire" },
  thinking: { emoji: "🤔", name: "Thinking" },
};

type Status =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "unavailable" } // the typed-reaction API is not available (yet): never fake it
  | { kind: "ready"; state: ReactionState; saving: ReactionType | null | undefined; failed: ReactionType | null | undefined };

/**
 * One reaction per member per post (#206 contract): Like is the heart, plus Celebrate, Fire and
 * Thinking. Counts are the server's canonical totals (people, not taps); nothing is shown as saved
 * until the server confirms it, and a failed change keeps the previous reaction with a retry.
 */
export default function ReactionPicker({
  postId,
  onCommitted,
}: {
  postId: string;
  /** Called with the server's confirmed total and whether this member has any reaction. */
  onCommitted: (total: number, reacted: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "closed" });
  const generation = useRef(0);
  const panel = useRef<HTMLDivElement>(null);

  // A different account must never see or change this account's reaction state.
  useEffect(
    () =>
      onUserChange(() => {
        generation.current++;
        setStatus({ kind: "closed" });
      }),
    [],
  );

  async function open() {
    if (status.kind !== "closed") return setStatus({ kind: "closed" });
    const n = ++generation.current;
    setStatus({ kind: "loading" });
    const r = await supabase.rpc("community_reaction_state", { p_post: postId });
    if (n !== generation.current) return;
    const state = r.error ? null : reactionState(r.data, postId);
    setStatus(state ? { kind: "ready", state, saving: undefined, failed: undefined } : { kind: "unavailable" });
    requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button[aria-pressed]")?.focus());
  }

  async function choose(desired: ReactionType | null) {
    if (status.kind !== "ready" || status.saving !== undefined) return; // one change at a time
    const n = ++generation.current;
    const before = status.state;
    setStatus({ kind: "ready", state: before, saving: desired, failed: undefined });
    const r = await supabase.rpc("set_community_reaction", { p_post: postId, p_reaction: desired });
    if (n !== generation.current) return; // closed, or the account changed
    const state = r.error ? null : reactionState(r.data, postId);
    if (!state) {
      // Keep the previous confirmed reaction; offer the same desired value again.
      setStatus({ kind: "ready", state: before, saving: undefined, failed: desired });
      return;
    }
    setStatus({ kind: "ready", state, saving: undefined, failed: undefined });
    onCommitted(state.total, state.mine !== null);
  }

  const ready = status.kind === "ready" ? status : null;
  return (
    <div className="reaction-picker">
      <button
        type="button"
        aria-expanded={status.kind !== "closed"}
        aria-label="React with an emoji"
        onClick={() => void open()}
      >
        <SmilePlus size={21} aria-hidden="true" />
      </button>
      {status.kind !== "closed" ? (
        <div
          className="reaction-panel"
          ref={panel}
          role="group"
          aria-label="Reactions"
          onKeyDown={(e) => {
            if (e.key === "Escape") setStatus({ kind: "closed" });
          }}
        >
          {status.kind === "loading" ? <p role="status">Loading reactions…</p> : null}
          {status.kind === "unavailable" ? (
            <p role="status">
              Emoji reactions aren’t available yet. Like still works.
            </p>
          ) : null}
          {ready ? (
            <>
              <div className="reaction-choices">
                {REACTION_TYPES.map((type) => {
                  const selected = ready.state.mine === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={selected}
                      disabled={ready.saving !== undefined}
                      aria-label={`${LABEL[type].name}, ${ready.state.counts[type]} ${ready.state.counts[type] === 1 ? "person" : "people"}${selected ? ", your reaction (tap to remove)" : ""}`}
                      onClick={() => void choose(nextReaction(ready.state.mine, type))}
                    >
                      <span aria-hidden="true">{LABEL[type].emoji}</span>
                      <small>{ready.state.counts[type]}</small>
                    </button>
                  );
                })}
              </div>
              {ready.saving !== undefined ? <p role="status">Saving…</p> : null}
              {ready.failed !== undefined ? (
                <p role="alert">
                  Your reaction didn’t save; it’s unchanged.{" "}
                  <button type="button" onClick={() => void choose(ready.failed as ReactionType | null)}>
                    Retry
                  </button>
                </p>
              ) : null}
              <p className="reaction-note">One reaction per person; choosing another replaces it.</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
