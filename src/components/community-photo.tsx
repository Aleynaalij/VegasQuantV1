"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COMMUNITY_PHOTO_BUCKET } from "@/lib/community-photo";
export default function CommunityPhoto({
  path,
  title,
}: {
  path: string;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const request = ++epoch;
      const r = await supabase.storage
        .from(COMMUNITY_PHOTO_BUCKET)
        .createSignedUrl(path, 60);
      if (live && request === epoch) setUrl(r.error ? null : r.data.signedUrl);
    }
    void load();
    const timer = setInterval(() => void load(), 45000);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setUrl(null);
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [path]);
  return url ? (
    <a
      className="community-photo"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open photo: ${title}`}
    >
      <img src={url} alt={`Member-uploaded photo: ${title}`} loading="lazy" />
      <small>Tap to open full photo</small>
    </a>
  ) : (
    <p className="muted">Photo unavailable or loading.</p>
  );
}
