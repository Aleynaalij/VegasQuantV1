"use client";
import { useState } from "react";
export default function RunShare({
  challengeId,
}: {
  number: number;
  checks: number[];
  status: string;
  challengeId: string;
}) {
  const [notice, setNotice] = useState(""),
    [fallback, setFallback] = useState("");
  const url = () =>
    `${location.origin}/?challenge=${encodeURIComponent(challengeId)}`;
  async function invite() {
    try {
      if (navigator.share)
        await navigator.share({
          title: "Join my 5-Spot Challenge",
          text: "Five stages. Follow the decisions with me—no wager required.",
          url: url(),
        });
      else {
        await navigator.clipboard.writeText(url());
        setNotice("Invite link copied.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setFallback(url());
        setNotice("Copy your invite link below.");
      }
    }
  }
  return (
    <div className="run-share">
      <button className="text-link" onClick={invite}>
        Invite a friend ↗
      </button>
      {notice && <small role="status">{notice}</small>}
      {fallback && (
        <input
          aria-label="Invite link"
          readOnly
          value={fallback}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
