"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import {
  serverClock,
  storyNow,
  type StoryClock,
} from "./community-story-contracts";
import { storyWakeDelay } from "./story-expiry";

/** Account-scoped, fail-closed story time. Resuming always needs a new server sample. */
export function useStoryClock(created: readonly string[] = []) {
  const clock = useRef<StoryClock | null>(null);
  const account = useRef<string | null | undefined>(undefined);
  const previous = useRef<StoryClock | null>(null);
  const generation = useRef(0);
  const [version, setVersion] = useState(0);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  const syncRef = useRef<() => void>(() => {});
  const getNow = useCallback(
    () =>
      typeof document === "undefined" || document.visibilityState !== "visible"
        ? null
        : storyNow(clock.current, performance.now()),
    [],
  );
  useEffect(() => {
    let live = true;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const invalidate = () => {
      clock.current = null;
      setVersion((n) => n + 1);
    };
    const sync = async () => {
      const request = ++generation.current;
      invalidate();
      setFailed(false);
      if (document.visibilityState !== "visible") return;
      try {
        const result = await supabase.auth.getSession();
        if (!live || request !== generation.current) return;
        const uid = result.data.session?.user.id ?? null;
        if (account.current !== uid) previous.current = null;
        account.current = uid;
        if (!uid) {
          setFailed(true);
          return;
        }
        const sent = performance.now();
        const response = await supabase.rpc("community_story_clock");
        if (
          !live ||
          request !== generation.current ||
          account.current !== uid ||
          document.visibilityState !== "visible"
        )
          return;
        const received = performance.now();
        const next =
          !response.error && response.data?.version === 1
            ? serverClock(response.data.server_now, sent, received)
            : null;
        const oldNow = storyNow(previous.current, received);
        const nextNow = storyNow(next, received);
        if (!next || nextNow === null) {
          setFailed(true);
          return;
        }
        // Preserve the earlier conservative upper bound when RTT varies; never move backwards.
        const adopted = {
          ...next,
          serverNowMs: Math.max(nextNow, oldNow ?? nextNow),
        };
        clock.current = adopted;
        previous.current = adopted;
        setVersion((n) => n + 1);
      } catch {
        if (live && request === generation.current) setFailed(true);
      }
    };
    syncRef.current = () => {
      void sync();
    };
    const resume = () => {
      void sync();
    };
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      if (account.current === undefined) {
        account.current = uid;
        return;
      }
      if (account.current === uid) return;
      account.current = uid;
      previous.current = null;
      ++generation.current;
      invalidate();
      // Do not await an RPC from within Supabase's auth callback.
      const timer = setTimeout(() => {
        pending.delete(timer);
        if (live) void sync();
      }, 0);
      pending.add(timer);
    });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    void sync();
    return () => {
      live = false;
      ++generation.current;
      clock.current = null;
      pending.forEach(clearTimeout);
      auth.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      syncRef.current = () => {};
    };
  }, []);
  // Include every eligible original creation time, not the time it was opened or read.
  const key = created.join("|");
  useEffect(() => {
    const delay = storyWakeDelay(
      clock.current,
      performance.now(),
      key ? key.split("|") : [],
    );
    if (delay === null) return;
    const timer = setTimeout(() => {
      if (getNow() === null) syncRef.current();
      else setTick((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [version, tick, key, getNow]);
  // Retry only while visible, with a bounded frequency; never display stale time.
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") syncRef.current();
    }, 30000);
    return () => clearTimeout(timer);
  }, [failed, version]);
  const retry = useCallback(() => syncRef.current(), []);
  return { now: getNow(), version, failed, getNow, retry };
}
