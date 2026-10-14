"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
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
export default function AgeAccessBoundary({
  children,
  extras,
}: {
  children: ReactNode;
  extras?: ReactNode;
}) {
  const path = usePathname();
  const [mode, setMode] = useState<
      "checking" | "allowed" | "required" | "error"
    >("checking"),
    [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let live = true;
    async function check() {
      const current = ++generation.current;
      try {
        const r = await supabase.auth.getSession();
        if (!live || current !== generation.current) return;
        if (!r.data.session) {
          setMode("allowed");
          return;
        }
        // Fail closed when changing sessions; never reuse another account's result.
        setMode("checking");
        const status = await supabase.rpc("age_verification_status");
        if (!live || current !== generation.current) return;
        if (status.error) {
          setMode("error");
          return;
        }
        setMode(
          status.data.required && !status.data.verified
            ? "required"
            : "allowed",
        );
      } catch {
        if (live && current === generation.current) setMode("error");
      }
    }
    void check();
    const listener = supabase.auth.onAuthStateChange(() => {
      generation.current++;
      setMode("checking");
      setTimeout(() => void check(), 0);
    });
    window.addEventListener("vq:age-verified", check);
    return () => {
      live = false;
      generation.current++;
      listener.data.subscription.unsubscribe();
      window.removeEventListener("vq:age-verified", check);
    };
  }, [retry]);
  if (accountPaths.has(path))
    return (
      <>
        {children}
        {mode === "allowed" ? extras : null}
      </>
    );
  if (mode === "allowed")
    return (
      <>
        {children}
        {extras}
      </>
    );
  return (
    <main className="age-access-gate">
      <section className="panel">
        <span className="eyebrow">VEGAS QUANT · 21+</span>
        {mode === "checking" ? (
          <>
            <h1>Checking your account…</h1>
            <p>This only takes a moment.</p>
          </>
        ) : mode === "error" ? (
          <>
            <h1>We’re having trouble checking your account</h1>
            <p>
              This is usually a brief connection problem. Nothing on your
              account has changed. Try again in a moment.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => setRetry((v) => v + 1)}
            >
              Try again
            </button>
            <p>
              <Link href="/account/verify-age">Age verification</Link> ·{" "}
              <Link href="/support">Help & support</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Verify your age to continue</h1>
            <p>
              All accounts must complete the same independent 21+ age check
              before using account features.
            </p>
            <Link className="primary" href="/account/verify-age">
              Open age verification →
            </Link>{" "}
            <Link className="secondary" href="/membership">
              Manage account
            </Link>
            <p>
              <Link href="/support">Help & support</Link>
            </p>
          </>
        )}
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
