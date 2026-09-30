"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Desk } from "@/lib/domain";
import PickCard from "./pick-card";
export default function AdminShare({ id }: { id: string }) {
  const [desk, setDesk] = useState<Desk | null>(null),
    [notice, setNotice] = useState("Checking admin access…");
  useEffect(() => {
    let live = true;
    void (async () => {
      const a = await supabase.rpc("is_admin");
      if (!a.data) {
        if (live)
          setNotice(
            "Sign in and verify your authenticator to export a clean share card.",
          );
        return;
      }
      const d = await supabase.rpc("desk_data");
      if (live && !d.error) {
        setDesk(d.data);
        setNotice("");
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  const pick = desk?.picks.find((p) => p.id === id);
  async function download() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const r = await fetch(`/picks/${id}/image`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (!r.ok) {
      setNotice("Admin verification required.");
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `vegas-quant-${id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="share-page">
      <Link href="/">VEGAS QUANT</Link>
      {notice && <p role="status">{notice}</p>}
      {pick && desk ? (
        <>
          <PickCard p={pick} d={desk} share />
          <button className="primary" onClick={download}>
            Download clean share card
          </button>
        </>
      ) : (
        <Link href="/membership">Sign in / verify admin →</Link>
      )}
    </main>
  );
}
