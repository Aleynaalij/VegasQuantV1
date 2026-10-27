"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
export default function AdminShare({ id }: { id: string }) {
  const [url, setUrl] = useState<string>();
  const [file, setFile] = useState<File>();
  const [notice, setNotice] = useState("Preparing your share card…");
  useEffect(() => {
    let live = true,
      objectUrl: string | undefined;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session)
          throw new Error("Sign in with your free account to share a pick.");
        const r = await fetch(`/picks/${id}/image`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "Pick not found."
              : "Could not generate the card. Check your sign-in and try again.",
          );
        const blob = await r.blob();
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFile(
          new File([blob], `vegas-quant-${id}.png`, { type: "image/png" }),
        );
        setNotice("");
      } catch (e) {
        if (live)
          setNotice(
            e instanceof Error
              ? e.message
              : "Unable to generate card. Try again.",
          );
      }
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  async function share() {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Vegas Quant · Official Play",
        });
      } else
        setNotice(
          "Your browser does not support image sharing. Save the card below, then share it from Photos or Files.",
        );
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setNotice(
          "Sharing unavailable. Save the image below to share it manually.",
        );
    }
  }
  return (
    <main
      className="share-page"
      style={{ maxWidth: 540, margin: "auto", padding: "24px 16px 110px" }}
    >
      <Link href="/">← VEGAS QUANT</Link>
      <h1>Share Pick</h1>
      <p>
        Original published details. Odds may change. No wager is guaranteed.
      </p>
      <p role="status">{notice}</p>
      {url && (
        <>
          {/* Authenticated blob preview: never expose a public image URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Vegas Quant official pick with published selection, odds, stake, edge, confidence and publication time"
            style={{ width: "100%", height: "auto", borderRadius: 16 }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 20,
            }}
          >
            <button className="primary" onClick={share}>
              Share Pick
            </button>
            <a
              className="primary"
              href={url}
              download={`vegas-quant-${id}.png`}
            >
              Save image
            </a>
          </div>
        </>
      )}
      {!url && <Link href="/membership">Account / sign in →</Link>}
    </main>
  );
}
