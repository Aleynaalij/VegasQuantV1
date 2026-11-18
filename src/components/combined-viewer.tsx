"use client";
import CommunitySettings from "./community-settings";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useViewerIdentity, viewerAuth } from "@/lib/viewer-auth";
import { viewerPresentation } from "@/lib/viewer-presentation";

export function CombinedAccountLink() {
  const viewer = useViewerIdentity(),
    view = viewerPresentation(viewer);
  return (
    <Link
      className="admin-link"
      href={view.accountHref}
      data-viewer-state={viewer.state}
    >
      {view.accountLabel}
    </Link>
  );
}
export function CombinedSignOut() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await viewerAuth.signOut();
          setBusy(false);
          if (r.error) setError(r.error.message);
          else location.assign("/staging/private-access");
        }}
      >
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function CombinedAccountContent() {
  const viewer = useViewerIdentity(),
    view = viewerPresentation(viewer);
  const [notice, setNotice] = useState("");
  return (
    <section className="panel" aria-labelledby="stage-account-title">
      <span className="eyebrow">ISOLATED STAGING</span>
      <h1 id="stage-account-title">Account</h1>
      <p role="status">{view.message}</p>
      {view.allowed && (
        <>
          <p>{viewer.session!.user.email ?? viewer.session!.user.id}</p>
          {viewer.capabilities.profile && (
            <CommunitySettings
              key={viewer.session!.user.id}
              uid={viewer.session!.user.id}
            />
          )}
          <p>
            Account deletion, billing and MFA enrollment remain outside the
            isolated consumer contract.
          </p>
        </>
      )}
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          const r = await viewerAuth.getSession(true);
          setNotice(r.error ? r.error.message : "Current session checked.");
        }}
      >
        Check account
      </button>
      <p role="status">{notice}</p>
      <p>
        <Link href="/staging/private-access">
          Private access and MFA sign-in
        </Link>{" "}
        · <Link href="/support">Help & support</Link>
      </p>
      <CombinedSignOut />
    </section>
  );
}
export function CombinedAgeBoundary({
  children,
  extras,
}: {
  children: ReactNode;
  extras?: ReactNode;
}) {
  const viewer = useViewerIdentity(),
    view = viewerPresentation(viewer);
  if (view.allowed)
    return (
      <>
        {children}
        {extras}
      </>
    );
  return (
    <main className="age-access-gate">
      <section className="panel">
        <h1>
          {viewer.state === "checking"
            ? "Checking your account…"
            : viewer.state === "denied"
              ? "Staging access denied"
              : "Account verification required"}
        </h1>
        <p role="status">{view.message}</p>
        <Link href="/staging/private-access">Private-access sign-in</Link>
        {viewer.failure !== "logout" && (
          <button
            type="button"
            className="secondary"
            onClick={() => void viewerAuth.getSession(true)}
          >
            Retry verification
          </button>
        )}
        <CombinedSignOut />
      </section>
    </main>
  );
}
export function CombinedProfileNotice() {
  const viewer = useViewerIdentity();
  return viewer.state === "ready" ? (
    <p className="stage-profile-status">
      <Link href="/membership">
        Profile settings unavailable in isolated staging
      </Link>
    </p>
  ) : null;
}
export function CombinedNotificationContent() {
  const viewer = useViewerIdentity();
  return (
    <section className="panel">
      <h1>Notifications</h1>
      <p role="status">
        {viewer.state === "ready"
          ? "Notifications are unavailable in isolated staging: counts, inbox, preferences and read actions have no verified backend contract. Unread count is unknown; no preferences or deliveries were changed."
          : viewerPresentation(viewer).message}
      </p>
      <Link href="/membership">Account</Link>
    </section>
  );
}
