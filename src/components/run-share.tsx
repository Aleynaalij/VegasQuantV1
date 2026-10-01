"use client";
import { useState } from "react";
import { runShareText } from "@/lib/challenge-run";
export default function RunShare({
  number,
  checks,
  status,
  challengeId,
}: {
  number: number;
  checks: number[];
  status: string;
  challengeId: string;
}) {
  const followed = checks.length;
  const [notice, setNotice] = useState(""),
    [fallback, setFallback] = useState(""),
    [busy, setBusy] = useState(false);
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
  async function card() {
    setBusy(true);
    setNotice("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const c = canvas.getContext("2d");
      if (!c) throw Error("Canvas unavailable");
      c.fillStyle = "#080e12";
      c.fillRect(0, 0, 1080, 1350);
      const glow = c.createRadialGradient(900, 120, 0, 900, 120, 700);
      glow.addColorStop(0, "#163e33");
      glow.addColorStop(1, "#080e12");
      c.fillStyle = glow;
      c.fillRect(0, 0, 1080, 1000);
      c.fillStyle = "#79dfb8";
      c.font = "bold 34px sans-serif";
      c.fillText("VEGAS QUANT", 80, 110);
      c.fillStyle = "#f0f4f2";
      c.font = "bold 83px sans-serif";
      c.fillText("THE 5-SPOT", 80, 255);
      c.fillText("CHALLENGE", 80, 355);
      c.font = "30px sans-serif";
      c.fillStyle = "#a1afba";
      c.fillText(`MY RUN  /  CHALLENGE #${number}`, 80, 430);
      for (let i = 0; i < 5; i++) {
        const x = 140 + i * 200;
        c.beginPath();
        c.arc(x, 580, 53, 0, Math.PI * 2);
        c.fillStyle = checks.includes(i + 1) ? "#79dfb8" : "#18252e";
        c.fill();
        c.font = "bold 35px sans-serif";
        c.fillStyle = checks.includes(i + 1) ? "#080e12" : "#a1afba";
        c.textAlign = "center";
        c.fillText(String(i + 1), x, 592);
      }
      c.textAlign = "left";
      c.fillStyle = "#f0f4f2";
      c.font = "bold 65px sans-serif";
      c.fillText(`${followed} OF 5 STAGES FOLLOWED`, 80, 780);
      c.font = "bold 32px sans-serif";
      c.fillStyle = "#79dfb8";
      c.fillText(status, 80, 860);
      c.fillStyle = "#a1afba";
      c.font = "28px sans-serif";
      c.fillText("Five stages. Your decisions. Track your run.", 80, 1020);
      c.fillText("Follow along—no wager required.", 80, 1070);
      c.font = "23px sans-serif";
      c.fillText(
        "Entertainment challenge. No outcome is guaranteed.",
        80,
        1215,
      );
      c.fillStyle = "#f0f4f2";
      c.fillText("vegasquant.app", 80, 1265);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("Image failed"))),
          "image/png",
        ),
      );
      const file = new File([blob], "vegas-quant-my-run.png", {
        type: "image/png",
      });
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({
          files: [file],
          title: "My Vegas Quant run",
          text: runShareText(number, followed, status),
          url: url(),
        });
      else {
        const object = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = object;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(object), 1000);
        setNotice("Share card downloaded.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice(
          "Could not create the card. You can still share an invite link.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="run-share">
      <button className="text-link" onClick={invite}>
        Invite a friend ↗
      </button>
      <button className="text-link" disabled={busy} onClick={card}>
        {busy ? "Creating…" : "Share my run ↗"}
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
