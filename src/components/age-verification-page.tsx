"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Shell, Panel } from "./ui";
import AgeVerificationPanel from "./age-verification-panel";
export default function AgeVerificationPage() {
  const [uid, setUid] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    let generation = 0;
    async function check() {
      const current = ++generation;
      const r = await supabase.auth.getSession();
      if (live && current === generation) {
        setUid(r.data.session?.user.id || null);
        setLoading(false);
      }
    }
    void check();
    const l = supabase.auth.onAuthStateChange(() => {
      generation++;
      setTimeout(() => void check(), 0);
    });
    return () => {
      live = false;
      generation++;
      l.data.subscription.unsubscribe();
    };
  }, []);
  return (
    <Shell active="account">
      <div className="page-heading">
        <span className="eyebrow">ACCOUNT SECURITY</span>
        <h1>Age verification</h1>
      </div>
      {loading ? (
        <Panel title="Checking your session">
          <p>Please wait…</p>
        </Panel>
      ) : uid ? (
        <AgeVerificationPanel key={uid} uid={uid} />
      ) : (
        <Panel title="Sign in first">
          <p>Confirm your account email, then sign in to verify your age.</p>
          <Link className="primary" href="/membership">
            Open Account →
          </Link>
        </Panel>
      )}
      <p>
        <Link href="/membership">
          Manage subscription, sign out or delete account →
        </Link>
      </p>
    </Shell>
  );
}
