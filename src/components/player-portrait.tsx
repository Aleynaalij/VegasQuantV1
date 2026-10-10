"use client";
import { useState } from "react";
// ESPN athlete IDs verified against the corresponding player profile pages.
const portraits: Record<string, string> = {
  "chris olave": "4361370", "juwan johnson": "3929645",
  "alvin kamara": "3054850", "drake london": "4426502",
  "james cook": "4379399", "james cook iii": "4379399",
  "jaylen warren": "4569987",
};
export default function PlayerPortrait({ name }: { name: string }) {
  const id = portraits[name.trim().toLowerCase()];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : null;
  return <span className="player-portrait" aria-hidden="true">
    {src && failedSource !== src
      ? <img src={src} alt="" width={88} height={64} loading="lazy" decoding="async" onError={() => setFailedSource(src)} />
      : <span>{name.split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join("")}</span>}
  </span>;
}
