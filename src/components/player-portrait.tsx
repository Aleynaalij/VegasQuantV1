"use client";
import { useState } from "react";
import registry from "@/lib/nfl-portraits.json";
const portraits: Record<string, string> = registry.portraits;
export default function PlayerPortrait({ name }: { name: string }) {
  const id = portraits[name.trim().toLowerCase()];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = id
    ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`
    : null;
  return (
    <span className="player-portrait" aria-hidden="true">
      {src && failedSource !== src ? (
        <img
          src={src}
          alt=""
          width={88}
          height={64}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span>
          {name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")}
        </span>
      )}
    </span>
  );
}
