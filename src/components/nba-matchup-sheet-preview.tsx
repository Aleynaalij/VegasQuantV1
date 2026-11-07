"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchNbaMatchupSheet,
  matchupSheetImageUrl,
} from "@/lib/nba-matchup-sheet-client";

export default function NbaMatchupSheetPreview({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const [image, setImage] = useState<{ url: string; title: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = link.current;
    if (!target) return;
    const abort = new AbortController();
    let url = "";

    async function load() {
      try {
        const sheet = await fetchNbaMatchupSheet(id, abort.signal, userId);
        if (abort.signal.aborted) return;
        url = matchupSheetImageUrl(sheet.svg);
        setImage({ url, title: sheet.title });
      } catch {
        if (!abort.signal.aborted) setFailed(true);
      }
    }

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer?.disconnect();
            void load();
          });
    if (observer) observer.observe(target);
    else void load();

    return () => {
      observer?.disconnect();
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, userId]);

  return (
    <Link
      ref={link}
      className="zone-sheet-preview"
      aria-label="Open matchup cheat sheet"
      href={`/nba/matchup-sheet/${id}`}
      prefetch={false}
    >
      {failed ? (
        <span className="zone-sheet-preview-unavailable">
          Sheet unavailable in the feed.
        </span>
      ) : image ? (
        <img
          src={image.url}
          alt={`Vegas Quant matchup cheat sheet for ${image.title}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="zone-sheet-preview-placeholder">
          Loading matchup cheat sheet…
        </span>
      )}
      <span className="zone-sheet-preview-footer">
        {failed ? "Open matchup cheat sheet" : "Open full-size sheet"}
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    </Link>
  );
}
