import type { ViewerIdentity } from "./viewer-contract";
/** Never mistake an unavailable verifier for a signed-out visitor or a missing profile. */
export function viewerPresentation(viewer: ViewerIdentity) {
  const allowed =
    viewer.state === "ready" && viewer.age === "verified" && !!viewer.session;
  return {
    allowed,
    accountLabel: allowed
      ? "Account"
      : viewer.state === "checking"
        ? "Checking account…"
        : viewer.state === "anonymous"
          ? "Sign in"
          : viewer.state === "denied"
            ? "Access denied"
            : "Account unavailable",
    accountHref:
      viewer.state === "anonymous" ? "/staging/private-access" : "/membership",
    message: allowed
      ? "Your isolated staging session, age status and research access are verified."
      : viewer.state === "checking"
        ? "Checking your private-access session…"
        : viewer.state === "anonymous"
          ? "Sign in through private access to continue."
          : viewer.state === "denied"
            ? "This session no longer has authorized staging access."
            : "Your account could not be verified. Protected content is unavailable. Retry or sign out.",
  };
}
