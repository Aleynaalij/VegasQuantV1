"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CommunitySettings from "./community-settings";

type Application = {
  state: "pending" | "approved" | "declined";
  approved: boolean;
  onboarding_complete: boolean;
};
const accountPaths = new Set([
  "/membership",
  "/account/verify-age",
  "/account/recovery",
  "/about",
  "/privacy",
  "/terms",
  "/support",
  "/faq",
  "/responsible-play",
]);
/** Age verification runs outside this boundary. Pending accounts may finish only their own setup. */
export default function BetaAccessBoundary({
  children,
  extras,
}: {
  children: ReactNode;
  extras?: ReactNode;
}) {
  const path = usePathname();
  const [application, setApplication] = useState<Application | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    let lastUser: string | null | undefined;
    async function check() {
      const current = ++generation.current;
      try {
        const session = await supabase.auth.getSession();
        if (!live || current !== generation.current) return;
        const id = session.data.session?.user.id ?? null;
        if (id !== lastUser) {
          setChecked(false);
          setApplication(null);
          lastUser = id;
        }
        setUid(id);
        if (!id) {
          setChecked(true);
          setError(false);
          return;
        }
        const r = await supabase.rpc("beta_application_status");
        if (!live || current !== generation.current) return;
        if (r.error || !r.data || typeof r.data.approved !== "boolean") {
          setError(true);
          setChecked(true);
          return;
        }
        setApplication(r.data as Application);
        setError(false);
        setChecked(true);
      } catch {
        if (live && current === generation.current) {
          setError(true);
          setChecked(true);
        }
      }
    }
    void check();
    const change = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? null) !== lastUser) {
        generation.current++;
        setChecked(false);
        setApplication(null);
      }
      setTimeout(() => void check(), 0);
    });
    const refresh = () => void check();
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("vq-community-changed", refresh);
    document.addEventListener("visibilitychange", focus);
    return () => {
      live = false;
      generation.current++;
      clearInterval(timer);
      change.data.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("vq-community-changed", refresh);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [retry]);
  if (accountPaths.has(path))
    return (
      <>
        {children}
        {checked && !error && (!uid || application?.approved) ? extras : null}
      </>
    );
  if (checked && !error && (!uid || application?.approved))
    return (
      <>
        {children}
        {extras}
      </>
    );
  return (
    <main className="age-access-gate">
      <section className="panel beta-application" aria-label="Testing access">
        <span className="eyebrow">VEGAS QUANT · PRIVATE BETA</span>
        {!checked ? (
          <>
            <h1>Checking your application…</h1>
            <p>This only takes a moment.</p>
          </>
        ) : error ? (
          <>
            <h1>We couldn’t check your application</h1>
            <p>Your application hasn’t changed. Please retry.</p>
          </>
        ) : application?.state === "declined" ? (
          <>
            <h1>Your application wasn’t approved</h1>
            <p>
              Vegas Quant is in a limited testing phase. Your account has not
              been granted app access.
            </p>
            <p>Contact support if you think this was a mistake.</p>
          </>
        ) : !application?.onboarding_complete ? (
          <>
            <h1>Finish your application</h1>
            <p>
              Confirm your email and complete your profile. Then your
              application goes to the testing queue for review.
            </p>
            {uid && (
              <CommunitySettings
                key={uid}
                uid={uid}
                required
                onSaved={() => setRetry((v) => v + 1)}
              />
            )}
          </>
        ) : (
          <>
            <h1>Application pending approval</h1>
            <p>
              You’re all set. Vegas Quant is currently in testing, so every new
              account is reviewed before access is granted.
            </p>
            <p>
              You don’t need to submit again. This screen will update when your
              application is approved.
            </p>
          </>
        )}
        {checked && (
          <button
            type="button"
            className="primary"
            onClick={() => setRetry((v) => v + 1)}
          >
            Check status
          </button>
        )}
        <p>
          <Link href="/membership">Manage account</Link> ·{" "}
          <Link href="/support">Help & support</Link>
        </p>
        <button
          type="button"
          className="text-link"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
