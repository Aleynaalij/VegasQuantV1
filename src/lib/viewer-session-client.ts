import { featureCapabilities } from "./stage-feature-query";
import {
  emptyViewer,
  projectViewerUser,
  unavailableCapabilities,
  type ViewerIdentity,
} from "./viewer-contract";
/** Volatile application identity. No localStorage, refresh token or forged SDK session. */
export function createViewerSessionClient(transport: typeof fetch = fetch) {
  let snapshot: ViewerIdentity = emptyViewer;
  let generation = 0;
  let signingOut = false;
  let logoutPending: Promise<{ error: Error | null }> | undefined;
  let controller: AbortController | undefined;
  let pending: Promise<ViewerIdentity> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: ViewerIdentity) => {
    snapshot = next;
    listeners.forEach((fn) => fn());
  };
  const invalidate = () => {
    generation++;
    controller?.abort();
    pending = undefined;
    publish({ ...emptyViewer });
  };
  const read = (force = false): Promise<ViewerIdentity> => {
    if (signingOut) return Promise.resolve(snapshot);
    if (!force && snapshot.state === "ready") return Promise.resolve(snapshot);
    if (pending && !force) return pending;
    const epoch = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    pending = Promise.resolve().then(async () => {
      let next: ViewerIdentity;
      try {
        const response = await transport("/staging/discovery/session", {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal,
        });
        const raw = await response.json();
        if (response.status === 401)
          next = { ...emptyViewer, state: "anonymous" };
        else if (response.status === 403)
          next = { ...emptyViewer, state: "denied" };
        else {
          const user = projectViewerUser(raw.session?.user);
          if (
            !response.ok ||
            raw.state !== "ready" ||
            raw.age !== "verified" ||
            raw.session?.transport !== "httpOnly-stage" ||
            !user
          )
            throw Error("Invalid viewer contract");
          next = {
            state: "ready",
            session: { user, transport: "httpOnly-stage" },
            age: "verified",
            capabilities: featureCapabilities(raw) ?? unavailableCapabilities,
          };
        }
      } catch {
        next = { ...emptyViewer, state: "error" };
      }
      if (generation === epoch) {
        pending = undefined;
        publish(next);
      }
      // A late response must never hand an obsolete identity to an awaiting consumer.
      return snapshot;
    });
    publish({ ...emptyViewer });
    return pending;
  };
  const signOut = (): Promise<{ error: Error | null }> => {
    if (logoutPending) return logoutPending;
    signingOut = true;
    invalidate();
    logoutPending = (async () => {
      try {
        const result = await transport("/staging/discovery/session", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!result.ok)
          throw Error("Sign-out could not be verified. Please retry.");
        publish({ ...emptyViewer, state: "anonymous" });
        return { error: null };
      } catch (error) {
        publish({ ...emptyViewer, state: "error", failure: "logout" });
        return {
          error:
            error instanceof Error ? error : new Error("Sign-out unavailable"),
        };
      } finally {
        signingOut = false;
        logoutPending = undefined;
      }
    })();
    return logoutPending;
  };
  return {
    read,
    signOut,
    invalidate,
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
