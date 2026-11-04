"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { COMMUNITY_PHOTO_BUCKET } from "@/lib/community-photo";

// Signed links stay short-lived for privacy. A loaded photo does not need a new link to stay on
// screen, so the image is signed once and kept (re-signing every 45 seconds changed the <img> src
// and re-downloaded every photo). Opening the full photo signs a fresh link at that moment.
const TTL = 600;
const sign = async (path: string) => {
  const r = await supabase.storage.from(COMMUNITY_PHOTO_BUCKET).createSignedUrl(path, TTL);
  return r.error ? null : r.data.signedUrl;
};

/** Open the full photo in a new tab with a freshly signed link. Call from a click handler. */
export async function openCommunityPhoto(path: string) {
  // Open synchronously (popup blockers), then point the tab at a freshly signed link.
  // ("noopener" would make window.open return null, so the opener link is cut by hand.)
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const fresh = await sign(path).catch(() => null);
  if (tab && fresh) tab.location.href = fresh;
  else tab?.close();
}

export default function CommunityPhoto({
  path,
  title,
  onLoaded,
  openable = true,
}: {
  path: string;
  title: string;
  /** Called once the image has actually loaded (the story viewer counts a photo as seen only then). */
  onLoaded?: () => void;
  /** false: a plain image (the story viewer uses taps on it to move, and offers its own Open button). */
  openable?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      sign(path)
        .then((u) => {
          if (!live) return;
          setUrl(u);
          setFailed(!u);
        })
        .catch(() => live && setFailed(true));
    void load();
    // A different account may not be allowed this photo: drop it and ask again.
    const stop = onUserChange(() => {
      setUrl(null);
      setFailed(false);
      void load();
    });
    return () => {
      live = false;
      stop();
    };
  }, [path]);
  async function open(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    await openCommunityPhoto(path);
  }
  const image = url ? (
    <img src={url} alt={`Member-uploaded photo: ${title}`} loading="lazy" decoding="async" onLoad={onLoaded}
      onError={() => {
        // A signed link that cannot load (expired, removed) shows as unavailable, not a broken image.
        setUrl(null);
        setFailed(true);
      }}
    />
  ) : null;
  if (url && !openable) return <div className="community-photo">{image}</div>;
  return url ? (
    <a
      className="community-photo"
      href={url}
      onClick={open}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open photo: ${title}`}
    >
      {image}
      <small>Tap to open full photo</small>
    </a>
  ) : (
    <p className="muted">{failed ? "Photo unavailable." : "Photo loading…"}</p>
  );
}
