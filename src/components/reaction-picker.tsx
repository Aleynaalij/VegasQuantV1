"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

export type TypedReactions = {
  /** "unknown" until the first read; "unavailable" when the typed API is not deployed (#206). */
  api: "unknown" | "ok" | "unavailable";
  states: Record<string, ReactionState>;
  /** Posts with a reaction change in flight: every control for that post waits. */
  pending: Record<string, boolean>;
  /** The post's state; "unavailable" when the typed API is not deployed; null on any other failure. */
  load: (postId: string) => Promise<ReactionState | "unavailable" | null>;
  /** null on failure; "busy" when another change for this post is still in flight (ignored). */
  set: (postId: string, desired: ReactionType | null) => Promise<ReactionState | "busy" | null>;
  /** Reads many targets in one request (cards) or one by one (posts); same staleness rules as load. */
  loadMany: (ids: string[]) => Promise<"unavailable" | void>;
};

/** What the reactions belong to: community posts (#206) or VIP contributor lays (ruby cards). */
export type ReactionTarget = "post" | "card";

const missingFunction = (e: { code?: string; message?: string }) =>
  /PGRST202|not find the function|does not exist/i.test(`${e.code} ${e.message}`);

async function readStates(target: ReactionTarget, ids: string[]) {
  if (target === "post") {
    const r = await supabase.rpc("community_reaction_state", { p_post: ids[0] });
    return { error: r.error, rows: r.error ? [] : [r.data] };
  }
  const r = await supabase.rpc("ruby_card_reaction_states", { p_cards: ids });
  return { error: r.error, rows: !r.error && Array.isArray(r.data) ? (r.data as unknown[]) : [] };
}

/**
 * One authoritative reaction state per post (#206 contract), shared by the Like heart and the
 * emoji picker so they can never disagree: the server's mine/counts are the only source of truth,
 * every write sends an explicit desired value, and an account change clears everything.
 */
export function useTypedReactions(
  onCommitted: (postId: string, s: ReactionState) => void,
  target: ReactionTarget = "post",
): TypedReactions {
  const [api, setApi] = useState<TypedReactions["api"]>("unknown");
  const [states, setStates] = useState<Record<string, ReactionState>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // statesRef mirrors states for reads that must return the newest confirmed state.
  const account = useRef(0);
  // Per post: one change at a time across every control, and a count of changes started, so a
  // read that was sent before a change (or while one was in flight) can never overwrite it.
  const inFlight = useRef<Set<string>>(new Set());
  const changes = useRef<Record<string, number>>({});
  const statesRef = useRef<Record<string, ReactionState>>({});
  const committed = useRef(onCommitted);
  committed.current = onCommitted;
  useEffect(
    () =>
      onUserChange(() => {
        account.current++;
        inFlight.current = new Set();
        changes.current = {};
        statesRef.current = {};
        setStates({});
        setPending({});
        setApi("unknown");
      }),
    [],
  );
  // One read for one or many targets. Each target keeps its own staleness check: a read that was
  // sent before a change (or while one was in flight) never overwrites that change's state.
  const read = useCallback(async (ids: string[]): Promise<Record<string, ReactionState | null> | "unavailable" | null> => {
    const a = account.current;
    const before = ids.map((id) => [changes.current[id] ?? 0, inFlight.current.has(id)] as const);
    const r = await readStates(target, ids);
    if (a !== account.current) return null;
    const out: Record<string, ReactionState | null> = {};
    let fresh = false;
    let valid = false;
    ids.forEach((id, i) => {
      const [count, sentDuringChange] = before[i];
      if (sentDuringChange || (changes.current[id] ?? 0) !== count || inFlight.current.has(id)) {
        out[id] = statesRef.current[id] ?? null;
        return;
      }
      fresh = true;
      const s = r.rows.map((row) => reactionState(row, id)).find(Boolean) ?? null;
      out[id] = s;
      if (s) {
        valid = true;
        statesRef.current = { ...statesRef.current, [id]: s };
      }
    });
    // Every target changed meanwhile: keep the confirmed states, and never let this read's error
    // mark the typed API unavailable after a confirmed typed write.
    if (!fresh) return out;
    if (r.error) {
      // A missing function means the typed API is not deployed; any other failure stays "unknown".
      if (missingFunction(r.error)) {
        setApi("unavailable");
        return "unavailable";
      }
      return out;
    }
    if (!valid) return out;
    setApi("ok");
    setStates(statesRef.current);
    return out;
  }, [target]);
  const load = useCallback(async (postId: string): Promise<ReactionState | "unavailable" | null> => {
    const r = await read([postId]);
    return r === "unavailable" || r === null ? r : r[postId];
  }, [read]);
  const loadMany = useCallback(async (ids: string[]): Promise<"unavailable" | void> => {
    // Cards: up to 50 per request (the server's cap); posts: one request each.
    const size = target === "card" ? 50 : 1;
    const batches = Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size));
    for (const batch of batches) if (batch.length && (await read(batch)) === "unavailable") return "unavailable";
  }, [read, target]);
  const set = useCallback(async (postId: string, desired: ReactionType | null): Promise<ReactionState | "busy" | null> => {
    if (inFlight.current.has(postId)) return "busy";
    inFlight.current.add(postId);
    changes.current[postId] = (changes.current[postId] ?? 0) + 1;
    setPending((m) => ({ ...m, [postId]: true }));
    const a = account.current;
    let r;
    try {
      r =
        target === "post"
          ? await supabase.rpc("set_community_reaction", { p_post: postId, p_reaction: desired })
          : await supabase.rpc("set_ruby_card_reaction", { p_card: postId, p_reaction: desired });
    } finally {
      if (a === account.current) {
        inFlight.current.delete(postId);
        setPending((m) => ({ ...m, [postId]: false }));
      }
    }
    if (a !== account.current) return null;
    const s = r.error ? null : reactionState(r.data, postId);
    if (!s) return null;
    setApi("ok");
    statesRef.current = { ...statesRef.current, [postId]: s };
    setStates(statesRef.current);
    committed.current(postId, s);
    return s;
  }, [target]);
  return { api, states, pending, load, set, loadMany };
}

type Panel =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; saving: ReactionType | null | undefined; failed: ReactionType | null | undefined };

/**
 * Like/Celebrate/Fire/Thinking with canonical counts. One reaction per person; another choice
 * replaces it, the same choice removes it. Nothing shows as saved until the server confirms it.
 * Closing the panel invalidates anything still pending, so a late reply never reopens it or moves
 * focus (a committed change still updates the shared counts, which are the server's truth).
 */
export default function ReactionPicker({ postId, typed }: { postId: string; typed: TypedReactions }) {
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const session = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const state = typed.states[postId];

  const close = useCallback(() => {
    session.current++;
    setPanel({ kind: "closed" });
  }, []);
  useEffect(() => onUserChange(close), [close]);
  // Escape closes the picker wherever focus is (a choice button is disabled while saving, which
  // drops focus to the page, out of reach of a panel-level key handler).
  const isOpen = panel.kind !== "closed";
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  async function open() {
    if (panel.kind !== "closed") return close();
    const n = ++session.current;
    setPanel({ kind: "loading" });
    const s = await typed.load(postId);
    if (n !== session.current) return; // closed (or reopened) meanwhile
    setPanel(s === "unavailable" ? { kind: "unavailable" } : s ? { kind: "ready", saving: undefined, failed: undefined } : { kind: "error" });
    if (s && s !== "unavailable") requestAnimationFrame(() => {
      if (n === session.current) box.current?.querySelector<HTMLButtonElement>("button[aria-pressed]")?.focus();
    });
  }

  async function choose(desired: ReactionType | null) {
    if (panel.kind !== "ready" || panel.saving !== undefined || typed.pending[postId]) return; // one change at a time
    const n = session.current;
    setPanel({ kind: "ready", saving: desired, failed: undefined });
    const s = await typed.set(postId, desired);
    if (n !== session.current) return; // closed meanwhile: no panel update, no focus move
    if (s === "busy") return setPanel({ kind: "ready", saving: undefined, failed: undefined });
    setPanel({ kind: "ready", saving: undefined, failed: s ? undefined : desired });
  }

  return (
    <div className="reaction-picker">
      <button type="button" aria-expanded={panel.kind !== "closed"} aria-label="React with an emoji" onClick={() => void open()}>
        <SmilePlus size={21} aria-hidden="true" />
      </button>
      {panel.kind !== "closed" ? (
        <div
          className="reaction-panel"
          ref={box}
          role="group"
          aria-label="Reactions"
        >
          {panel.kind === "loading" ? <p role="status">Loading reactions…</p> : null}
          {panel.kind === "unavailable" ? <p role="status">Emoji reactions aren’t available yet. Like still works.</p> : null}
          {panel.kind === "error" ? <p role="alert">Reactions couldn’t load. Close and try again.</p> : null}
          {panel.kind === "ready" && state ? (
            <>
              <div className="reaction-choices">
                {REACTION_TYPES.map((type) => {
                  const selected = state.mine === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={selected}
                      disabled={panel.saving !== undefined || !!typed.pending[postId]}
                      aria-label={`${LABEL[type].name}, ${state.counts[type]} ${state.counts[type] === 1 ? "person" : "people"}${selected ? ", your reaction (tap to remove)" : ""}`}
                      onClick={() => void choose(nextReaction(state.mine, type))}
                    >
                      <span aria-hidden="true">{LABEL[type].emoji}</span>
                      <small>{state.counts[type]}</small>
                    </button>
                  );
                })}
              </div>
              {panel.saving !== undefined ? <p role="status">Saving…</p> : null}
              {panel.failed !== undefined ? (
                <p role="alert">
                  Your reaction didn’t save; it’s unchanged.{" "}
                  <button type="button" onClick={() => void choose(panel.failed as ReactionType | null)}>
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
