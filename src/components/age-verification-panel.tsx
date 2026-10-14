"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ageConsentVersion,
  type AgeStatus,
  safeIdentityUrl,
} from "@/lib/age-verification";
import { Panel } from "./ui";
export default function AgeVerificationPanel({ uid }: { uid: string }) {
  const [status, setStatus] = useState<AgeStatus | null>(null),
    [notice, setNotice] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const r = await supabase.auth.getSession();
      if (r.data.session?.user.id !== uid)
        throw Error("Sign in again to verify your age.");
      const response = await fetch("/api/age/status", {
        headers: { authorization: "Bearer " + r.data.session.access_token },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Verification status unavailable.");
      if (current !== generation.current) return;
      setStatus(data);
      setNotice("");
      if (data.verified) window.dispatchEvent(new Event("vq:age-verified"));
    } catch (e) {
      if (current === generation.current) {
        setStatus(null);
        setNotice(
          e instanceof Error ? e.message : "Verification status unavailable.",
        );
      }
    }
  }, [uid]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  async function start() {
    if (!consent || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await supabase.auth.getSession();
      if (r.data.session?.user.id !== uid)
        throw Error("Sign in again to verify your age.");
      const response = await fetch("/api/age/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer " + r.data.session.access_token,
        },
        body: JSON.stringify({ consent: ageConsentVersion }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Verification could not start.");
      const currentSession = await supabase.auth.getSession();
      if (currentSession.data.session?.user.id !== uid)
        throw Error("Your account changed. Sign in again before verifying.");
      if (data.url) {
        location.assign(safeIdentityUrl(data.url));
        return;
      }
      await refresh();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Verification could not start.",
      );
    } finally {
      setBusy(false);
    }
  }
  const blocked =
    status?.state === "underage" || status?.state === "needs_review";
  const retryAllowed =
    blocked &&
    !!status?.retry_after &&
    Date.now() >= Date.parse(status.retry_after);
  return (
    <Panel title="Verify your age · 21+" className="access-settings">
      <div className="notebook">
        {status?.verified ? (
          <>
            <p>
              <strong>Your age is verified: 21+.</strong>
            </p>
            <Link className="primary" href="/">
              Open Vegas Quant →
            </Link>
          </>
        ) : (
          <>
            <p>
              Vegas Quant is for adults 21 and older. New and existing accounts
              must complete independent age verification once the requirement is
              activated. A checkbox or typed birth date does not verify your
              age.
            </p>
            {status && !status.provider_available ? (
              <p role="status">
                Independent verification is being prepared. ID collection is not
                active yet. We’ll require verification when the service is
                ready.
              </p>
            ) : null}
            {status?.state === "processing" ? (
              <p role="status">
                Your verification is processing. Access stays pending until the
                server confirms you are 21+.
              </p>
            ) : null}
            {blocked ? (
              <p role="status">
                {status?.state === "underage"
                  ? "Verification did not meet the 21+ requirement. Account access is unavailable."
                  : "We couldn’t confirm your age. Account access stays pending; a review is required."}{" "}
                {status?.retry_after
                  ? "You may retry after " +
                    new Date(status.retry_after).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    }) +
                    " ET. "
                  : ""}
                You can still manage your subscription or delete your account in
                Account.
              </p>
            ) : null}
            {status?.provider_available &&
            (!blocked || retryAllowed) &&
            status.state !== "processing" ? (
              <>
                <p>
                  You’ll continue to Stripe Identity to capture a
                  government-issued photo ID and a matching selfie. Stripe
                  processes the ID, birth date and facial information. Vegas
                  Quant retains a 21+ result, verification reference and consent
                  record; it does not store your ID photos, selfie or full birth
                  date. This check is provided at no charge to the member.
                </p>
                <p>
                  <Link href="/terms">Terms of Use</Link> ·{" "}
                  <Link href="/privacy">Vegas Quant privacy notice</Link> ·{" "}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stripe privacy policy
                  </a>
                </p>
                <label className="vq-legal-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    I agree to the Vegas Quant Terms of Use, have read the
                    privacy and verification notices, and want to continue to
                    Stripe Identity for the ID and selfie age check. Stripe will
                    present its own consent flow.
                  </span>
                </label>
                <button
                  type="button"
                  className="primary"
                  disabled={!consent || busy}
                  onClick={() => void start()}
                >
                  {busy ? "Opening verification…" : "Verify age securely →"}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh verification status
            </button>
          </>
        )}
        <p role="status">{notice}</p>
      </div>
    </Panel>
  );
}
