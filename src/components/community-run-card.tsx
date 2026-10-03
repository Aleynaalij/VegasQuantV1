"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { runMilestone, type CommunityProfile } from "@/lib/community";
import { personalTotals, type PersonalEntry } from "@/lib/personal";
import { money } from "@/lib/domain";
export default function CommunityCard({
  profile,
  challengeId,
  number,
}: {
  profile: CommunityProfile;
  challengeId: string;
  number: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [identity, setIdentity] = useState(false),
    [includeBalance, setIncludeBalance] = useState(false),
    [format, setFormat] = useState("story"),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const blob = useRef<Blob | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function invalidate() {
    setPreview("");
    blob.current = null;
  }
  async function generate() {
    setBusy(true);
    setNotice("");
    invalidate();
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw Error("Sign in to create your Run Card.");
      const uid = auth.user.id;
      const [a, c, r] = await Promise.all([
        supabase
          .from("personal_challenges")
          .select("id,starting_cents")
          .eq("user_id", uid)
          .eq("challenge_id", challengeId)
          .maybeSingle(),
        supabase
          .from("challenge_checkins")
          .select("stage_number")
          .eq("user_id", uid)
          .eq("challenge_id", challengeId),
        supabase
          .from("challenge_runs")
          .select("mode")
          .eq("user_id", uid)
          .eq("challenge_id", challengeId)
          .maybeSingle(),
      ]);
      if (a.error || c.error || r.error)
        throw Error("Could not load your run. Try again.");
      if (!r.data && !a.data)
        throw Error("Join this challenge first to create your card.");
      let entries: PersonalEntry[] = [],
        adjustments = 0;
      if (a.data) {
        const [e, ad] = await Promise.all([
          supabase
            .from("personal_entry_state")
            .select("*")
            .eq("personal_challenge_id", a.data.id),
          supabase
            .from("personal_bankroll_adjustments")
            .select("delta_cents")
            .eq("personal_challenge_id", a.data.id),
        ]);
        if (e.error || ad.error) throw Error("Could not verify your record.");
        entries = e.data;
        adjustments = (ad.data || []).reduce(
          (s, x) => s + Number(x.delta_cents),
          0,
        );
      }
      const stages = new Map<string, number>();
      if (entries.length) {
        const published = await supabase.rpc("desk_data");
        if (published.error || !published.data)
          throw Error("Could not verify stage results.");
        for (const pick of published.data.picks as {
          id: string;
          stage_id: string | null;
        }[]) {
          const stage = (
            published.data.stages as {
              id: string;
              stage_number: number;
              challenge_id: string;
            }[]
          ).find(
            (x) => x.id === pick.stage_id && x.challenge_id === challengeId,
          );
          if (stage) stages.set(pick.id, stage.stage_number);
        }
      }
      const wins = entries
          .filter((e) => e.result === "WIN")
          .map((e) => stages.get(e.pick_id))
          .filter((n): n is number => n !== undefined),
        loss = entries.some((e) => e.result === "LOSS"),
        open = entries.some((e) => !e.result),
        checks = (c.data || []).map((x) => x.stage_number),
        status = runMilestone(wins, open, loss);
      const totals = personalTotals(
        a.data?.starting_cents || 0,
        entries,
        entries.flatMap((e) =>
          e.result
            ? [
                {
                  entry_id: e.id,
                  result: e.result,
                  profit_cents: e.profit_cents || 0,
                },
              ]
            : [],
        ),
        adjustments,
      );
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = format === "story" ? 1920 : 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("Image rendering unavailable.");
      const h = canvas.height,
        base = format === "story" ? 400 : 190;
      ctx.fillStyle = "#080f13";
      ctx.fillRect(0, 0, 1080, h);
      const glow = ctx.createRadialGradient(840, 120, 10, 840, 120, h);
      glow.addColorStop(0, "#225e49");
      glow.addColorStop(1, "#080f13");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1080, h);
      ctx.strokeStyle = "#7bddb4";
      ctx.lineWidth = 3;
      ctx.strokeRect(35, 35, 1010, h - 70);
      ctx.save();
      ctx.translate(75, 75);
      ctx.scale(0.075, 0.075);
      ctx.fillStyle = "#85e3bf";
      ctx.fill(
        new Path2D(
          "M0 0h165l232 435-61 105Z M300 180l120-180h300l167 233-114 199-69-118 62-81-70-116H486L369 318Z M454 275h137l223 281H665Z",
        ),
      );
      ctx.restore();
      ctx.fillStyle = "#eef9f4";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("VEGAS QUANT", 165, 108);
      ctx.fillStyle = "#9bb8ad";
      ctx.font = "22px sans-serif";
      ctx.fillText("COMMUNITY RUN CARD", 75, 155);
      if (identity && profile.avatar) {
        const img = new Image();
        img.src = profile.avatar;
        await img.decode();
        ctx.save();
        ctx.beginPath();
        ctx.arc(900, base + 18, 72, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, 828, base - 54, 144, 144);
        ctx.restore();
      }
      ctx.fillStyle = "#eef9f4";
      ctx.font = "bold 46px sans-serif";
      ctx.fillText(
        identity && profile.username
          ? `@${profile.username}`
          : "MY FIVE-STAGE RUN",
        75,
        base + 10,
        700,
      );
      ctx.font = "25px sans-serif";
      ctx.fillStyle = "#a1b9b0";
      ctx.fillText(
        `CHALLENGE #${number}${identity && profile.region ? ` · ${profile.region}` : ""}`,
        75,
        base + 58,
      );
      ctx.font = "bold 58px sans-serif";
      ctx.fillStyle = "#85e3bf";
      ctx.fillText(status, 75, base + 180, 930);
      for (let i = 1; i <= 5; i++) {
        const x = 140 + (i - 1) * 200;
        const won = wins.includes(i),
          entry = entries.find((e) => stages.get(e.pick_id) === i),
          label = won
            ? "WON"
            : entry?.result === "LOSS"
              ? "LOST"
              : entry?.result ||
                (entry
                  ? "IN PLAY"
                  : checks.includes(i)
                    ? "FOLLOWED"
                    : "UPCOMING");
        ctx.beginPath();
        ctx.arc(x, base + 305, 52, 0, Math.PI * 2);
        ctx.fillStyle = won
          ? "#85e3bf"
          : entry?.result === "LOSS"
            ? "#ba7171"
            : "#203c33";
        ctx.fill();
        ctx.textAlign = "center";
        ctx.font = "bold 35px sans-serif";
        ctx.fillStyle = won ? "#091510" : "#eef9f4";
        ctx.fillText(String(i), x, base + 317);
        ctx.font = "18px sans-serif";
        ctx.fillStyle = "#b2c9be";
        ctx.fillText(label, x, base + 391);
      }
      ctx.textAlign = "left";
      ctx.font = "26px sans-serif";
      ctx.fillStyle = "#eef9f4";
      ctx.fillText(
        entries.length
          ? `${totals.wins}W · ${totals.losses}L · ${entries.filter((e) => !e.result).length} OPEN ENTRIES`
          : `${checks.length}/5 STAGES FOLLOWED · NO WAGER REQUIRED`,
        75,
        base + 480,
        930,
      );
      if (includeBalance && a.data) {
        ctx.fillStyle = "#85e3bf";
        ctx.font = "bold 35px sans-serif";
        ctx.fillText(
          `TRACKED BANKROLL ${money(totals.balance)}`,
          75,
          base + 540,
        );
      }
      ctx.font = "21px sans-serif";
      ctx.fillStyle = "#a1b9b0";
      ctx.fillText(
        entries.length
          ? "Self-reported entries · recorded settlement results"
          : "Participation only · check-ins are not wager wins",
        75,
        h - 165,
        930,
      );
      ctx.fillText(
        "Entertainment challenge. No outcome is guaranteed.",
        75,
        h - 125,
        930,
      );
      ctx.fillText(
        `${new Date().toLocaleDateString("en-US")} · vegasquant.app`,
        75,
        h - 80,
      );
      const b = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (v) => (v ? resolve(v) : reject(Error("Could not generate image."))),
          "image/png",
        ),
      );
      blob.current = b;
      setPreview(URL.createObjectURL(b));
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share(download = false) {
    if (!blob.current) return;
    const file = new File([blob.current], "vegas-quant-run-card.png", {
      type: "image/png",
    });
    try {
      if (!download && navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: "My Vegas Quant run" });
      else {
        const a = document.createElement("a");
        a.href = preview;
        a.download = file.name;
        a.click();
        setNotice("Card downloaded. You can upload it to Instagram.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setNotice("Sharing unavailable. Use Download card instead.");
    }
  }
  return (
    <section className="community-panel">
      <span className="eyebrow">YOUR COLLECTIBLE</span>
      <h2>Make your Run Card</h2>
      <p>Your identity. Five stages. A snapshot worth sharing.</p>
      <button
        className="primary"
        onClick={() => {
          invalidate();
          setNotice("");
          dialog.current?.showModal();
        }}
      >
        Create my card ↗
      </button>
      <dialog
        ref={dialog}
        className="entry-dialog"
        aria-labelledby="run-card-title"
      >
        <div className="member-form">
          <h2 id="run-card-title">Preview your Run Card</h2>
          <label>
            Format
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                invalidate();
              }}
            >
              <option value="story">Instagram Story · 9:16</option>
              <option value="square">Square · 1:1</option>
            </select>
          </label>
          <label className="entry-confirm">
            <input
              type="checkbox"
              checked={identity}
              onChange={(e) => {
                setIdentity(e.target.checked);
                invalidate();
              }}
            />
            Include my username, photo and region
          </label>
          <label className="entry-confirm">
            <input
              type="checkbox"
              checked={includeBalance}
              onChange={(e) => {
                setIncludeBalance(e.target.checked);
                invalidate();
              }}
            />
            Include my tracked bankroll
          </label>
          <small>
            Only this exported card includes the details you select. Nothing is
            posted automatically. Check the preview before sharing.
          </small>
          <button className="secondary" disabled={busy} onClick={generate}>
            {busy ? "Creating…" : "Generate preview"}
          </button>
          {preview && (
            <>
              <img
                className="run-card-preview"
                src={preview}
                alt="Preview of your Vegas Quant Run Card"
              />
              <button className="primary" onClick={() => void share()}>
                Share this card ↗
              </button>
              <button className="secondary" onClick={() => void share(true)}>
                Download card
              </button>
            </>
          )}
          {notice && <p role="status">{notice}</p>}
          <button className="text-link" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </section>
  );
}
