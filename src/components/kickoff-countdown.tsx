"use client";
import { useEffect, useState } from "react";
function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
/** Live countdown to kickoff. Renders nothing until mounted to avoid hydration drift. */
export default function KickoffCountdown({ kickoff }: { kickoff: string }) {
  const target = Date.parse(kickoff);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null || !Number.isFinite(target)) return null;
  if (target <= now)
    return (
      <span className="vq-countdown live">
        <i aria-hidden="true" /> Kicked off
      </span>
    );
  const p = parts(target - now);
  const cells: [number, string][] = p.d
    ? [
        [p.d, "d"],
        [p.h, "h"],
        [p.m, "m"],
      ]
    : [
        [p.h, "h"],
        [p.m, "m"],
        [p.s, "s"],
      ];
  return (
    <span className="vq-countdown" role="timer" aria-label="Time to kickoff">
      {cells.map(([v, u]) => (
        <span key={u}>
          <b>{String(v).padStart(2, "0")}</b>
          <small>{u}</small>
        </span>
      ))}
    </span>
  );
}
