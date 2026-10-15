"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
/** Separate entertainment series; never substitutes for POD or Hail Mary. */
export default function LetsSweat() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const now = new Date();
      const r = await supabase
        .from("candidate_releases")
        .select("id,candidates")
        .contains("candidates", JSON.stringify([{ worth_a_dollar: true }]))
        .gte("created_at", new Date(now.getTime() - 7 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (live) {
        const row = r.data?.[0];
        setId(
          !r.error &&
            row &&
            Date.parse(row.candidates[0]?.sweat_until || "") > Date.now()
            ? row.id
            : null,
        );
      }
    }
    void load();
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);
  return id ? (
    <Link
      className="vq-lets-sweat"
      href={`/feed#release-${id}`}
      aria-label="Let’s Sweat — Worth a dollar of your time"
    >
      <i aria-hidden="true" />
      <span>Let’s Sweat</span>
    </Link>
  ) : null;
}
