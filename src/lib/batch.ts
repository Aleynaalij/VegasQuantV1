// Request coalescing for per-leg data. Many leg cards render at once and each used to query
// Supabase for its own row, so opening The Zone fired hundreds of requests. A batch loader
// collects the keys asked for in the same tick, fetches them in one `in (...)` query per chunk,
// and keeps the answers for `ttl` so switching tabs and back reuses them instead of refetching.

type Entry<T> = { value: T | undefined; at: number };

export type BatchLoader<T> = {
  /** The value for `key`, from cache when fresh, otherwise batched with other keys this tick. */
  load: (key: string) => Promise<T | undefined>;
  /** Values for many keys at once (one batch). */
  loadMany: (keys: string[]) => Promise<Map<string, T | undefined>>;
  /** Cached value without fetching (undefined when unknown or stale). */
  peek: (key: string) => T | undefined;
  /** Drop cached values so the next load refetches (after a write, or on sign-out). */
  invalidate: (keys?: string[]) => void;
};

export function batchLoader<T>(
  fetchMany: (keys: string[]) => Promise<Map<string, T>>,
  { ttl = 60000, chunk = 150 }: { ttl?: number; chunk?: number } = {},
): BatchLoader<T> {
  const cache = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T | undefined>>();
  let queue: { key: string; resolve: (v: T | undefined) => void; reject: (e: unknown) => void }[] = [];
  let scheduled = false;

  async function flush() {
    scheduled = false;
    const batch = queue;
    queue = [];
    const keys = [...new Set(batch.map((q) => q.key))];
    // The request each key belongs to now; invalidate() detaches it, so a stale answer is never
    // cached and never clears a newer request for the same key.
    const mine = new Map(keys.map((k) => [k, inflight.get(k)]));
    const current = (k: string) => inflight.get(k) === mine.get(k);
    const found = new Map<string, T>();
    try {
      for (let i = 0; i < keys.length; i += chunk) {
        const part = await fetchMany(keys.slice(i, i + chunk));
        for (const [k, v] of part) found.set(k, v);
      }
    } catch (e) {
      for (const k of keys) if (current(k)) inflight.delete(k);
      for (const q of batch) q.reject(e);
      return;
    }
    const now = Date.now();
    for (const k of keys) {
      if (!current(k)) continue;
      inflight.delete(k);
      cache.set(k, { value: found.get(k), at: now });
    }
    for (const q of batch) q.resolve(found.get(q.key));
  }

  function fresh(key: string) {
    const e = cache.get(key);
    return e && Date.now() - e.at < ttl ? e : undefined;
  }

  function load(key: string) {
    const hit = fresh(key);
    if (hit) return Promise.resolve(hit.value);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = new Promise<T | undefined>((resolve, reject) => {
      queue.push({ key, resolve, reject });
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 0);
      }
    });
    inflight.set(key, p);
    return p;
  }

  return {
    load,
    async loadMany(keys) {
      const values = await Promise.all(keys.map(load));
      return new Map(keys.map((k, i) => [k, values[i]]));
    },
    peek: (key) => fresh(key)?.value,
    invalidate(keys) {
      // Also detach in-flight requests: a load after a write must not join a request that
      // started before it (its answer is not cached either, see `gen` in flush).
      if (!keys) {
        cache.clear();
        inflight.clear();
      } else
        for (const k of keys) {
          cache.delete(k);
          inflight.delete(k);
        }
    },
  };
}

/** One shared promise per key for `ttl`: for whole-app values like "is this user an admin". */
export function memo<T>(fn: () => Promise<T>, ttl = 60000) {
  let value: Promise<T> | null = null,
    at = 0;
  return {
    get() {
      if (!value || Date.now() - at > ttl) {
        at = Date.now();
        value = fn().catch((e) => {
          value = null;
          throw e;
        });
      }
      return value;
    },
    reset() {
      value = null;
    },
  };
}
