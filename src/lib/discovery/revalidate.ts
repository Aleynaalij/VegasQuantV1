/** Discovery-only lifecycle. Clear protected content before any asynchronous reread.
 * Server-side entitlement revocation has no push channel: visible tabs target a 60-second polling interval (browser throttling or offline
 * state can delay it; this is not instant revocation); hidden tabs discard content and recheck on return.
 */
export function watchDiscoveryAccess(
  invalidate: () => void,
  reload: () => void,
  subscribe: (changed: () => void) => () => void,
  environment = {
    window,
    document,
    schedule: (fn: () => void) => setTimeout(fn, 0),
    cancel: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    repeat: (fn: () => void) => setInterval(fn, 60_000),
    stop: (id: ReturnType<typeof setInterval>) => clearInterval(id),
  },
) {
  let disposed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    invalidate();
    if (pending !== undefined) environment.cancel(pending);
    // Never await Supabase operations inside its auth notification lock.
    pending = environment.schedule(() => {
      pending = undefined;
      if (!disposed && environment.document.visibilityState !== "hidden")
        reload();
    });
  };
  const unsubscribe = subscribe(check);
  environment.window.addEventListener("focus", check);
  environment.document.addEventListener("visibilitychange", check);
  const interval = environment.repeat(check);
  return () => {
    disposed = true;
    unsubscribe();
    if (pending !== undefined) environment.cancel(pending);
    environment.stop(interval);
    environment.window.removeEventListener("focus", check);
    environment.document.removeEventListener("visibilitychange", check);
  };
}
