"use client";
import { useEffect, useState } from "react";
import { Panel } from "./ui";
type Subscription = {
  status: string;
  cancel_at_period_end: boolean;
  paid_until: string | null;
  blocked: boolean;
};
export default function BillingAccount({ token }: { token: string }) {
  const [sub, setSub] = useState<Subscription | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setSub(null);
    fetch("/api/billing/account", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (live) setSub(d.subscription || null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [token]);
  async function manage() {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/billing/account", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      location.assign(d.url);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to open billing");
    } finally {
      setBusy(false);
    }
  }
  if (!sub) return null;
  return (
    <Panel title="Your monthly subscription">
      <div className="notebook">
        <p>
          {sub.blocked
            ? "Payment needs review"
            : sub.cancel_at_period_end
              ? "Canceled · no further renewals"
              : sub.status}
        </p>
        {sub.paid_until && (
          <p>
            Paid access through {new Date(sub.paid_until).toLocaleString()}.
          </p>
        )}
        <button className="secondary" onClick={manage} disabled={busy}>
          Manage payment / cancel subscription
        </button>
        <p className="muted">
          Cancel before the next renewal to avoid another charge. Access
          continues through your paid period.
        </p>
        {notice && <p role="alert">{notice}</p>}
      </div>
    </Panel>
  );
}
