"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  dropPrompt,
  markPromptShown,
  mayShowPrompt,
  wantPrompt,
} from "@/lib/prompt-queue";
import {
  Card,
  Outcome,
  deck,
  total,
  outcome,
  randomInt,
  dayKey,
} from "@/lib/daily-luck";
import "./daily-luck.css";
type Round = {
  mode: "dice" | "blackjack";
  player: Card[];
  house: Card[];
  remaining: Card[];
  dice?: number[];
  result?: Outcome;
};
export default function DailyLuck() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [notice, setNotice] = useState("");
  const handled = useRef(new Set<string>());
  const locked = useRef(false);
  useEffect(() => {
    let alive = true;
    const auth = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUid(
        session?.user && !session.user.is_anonymous ? session.user.id : null,
      );
    });
    return () => {
      alive = false;
      auth.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    dialog.current?.close();
    setRound(null);
    locked.current = false;
    if (!uid) return;
    const check = () => {
      const key = `vq-daily-luck-v1:${uid}:${dayKey()}`;
      if (
        handled.current.has(key) ||
        dialog.current?.open ||
        document.querySelector('dialog[open], [data-profile-required="true"]')
      )
        return;
      try {
        if (localStorage.getItem(key)) {
          handled.current.add(key);
          dropPrompt("luck");
          return;
        }
      } catch {
        /* Session-only fallback. */
      }
      // One optional pop-up per visit; alerts and phone setup go first.
      wantPrompt("luck");
      if (!mayShowPrompt("luck")) return;
      markPromptShown("luck");
      handled.current.add(key);
      setRound(null);
      locked.current = false;
      setNotice("");
      dialog.current?.showModal();
    };
    const timer = setInterval(check, 1500);
    return () => clearInterval(timer);
  }, [uid]);
  function remember() {
    if (!uid) return;
    try {
      localStorage.setItem(`vq-daily-luck-v1:${uid}:${dayKey()}`, "done");
    } catch {
      setNotice(
        "Daily play is remembered for this visit only because device storage is unavailable.",
      );
    }
  }
  function close() {
    remember();
    dialog.current?.close();
  }
  function finish(next: Round) {
    remember();
    locked.current = false;
    setRound(next);
  }
  function choose(mode: Round["mode"]) {
    if (locked.current || round) return;
    locked.current = true;
    remember(); // Starting consumes today’s round, including abandoned hands.
    if (mode === "dice") {
      setRound({ mode, player: [], house: [], remaining: [] });
      locked.current = false;
      return;
    }
    const cards = deck(),
      player = [cards.pop()!, cards.pop()!],
      house = [cards.pop()!, cards.pop()!];
    const next: Round = { mode, player, house, remaining: cards };
    if (total(player) === 21 || total(house) === 21)
      next.result = outcome(player, house);
    finish(next);
  }
  function roll() {
    if (locked.current || !round || round.result) return;
    locked.current = true;
    const dice = [randomInt(6) + 1, randomInt(6) + 1];
    if (dice[0] === dice[1]) {
      setRound({ ...round, dice });
      setNotice("Tie — tap to roll again.");
      locked.current = false;
    } else {
      setNotice("");
      finish({ ...round, dice, result: dice[0] > dice[1] ? "win" : "loss" });
    }
  }
  function play(hit: boolean) {
    if (locked.current || !round || round.result) return;
    locked.current = true;
    const remaining = [...round.remaining],
      player = [...round.player],
      house = [...round.house];
    if (hit) player.push(remaining.pop()!);
    if (hit && total(player) < 21) {
      setRound({ ...round, player, remaining });
      locked.current = false;
      return;
    }
    if (total(player) <= 21)
      while (total(house) < 17) house.push(remaining.pop()!);
    finish({
      ...round,
      player,
      house,
      remaining,
      result: outcome(player, house),
    });
  }
  const result = round?.result;
  return (
    <dialog
      ref={dialog}
      className="vq-luck"
      aria-labelledby="vq-luck-title"
      onCancel={close}
    >
      <div className="vq-luck-top">
        <img
          src="/brand/vq-mark.svg"
          alt="Vegas Quant"
          width="38"
          height="38"
        />
        <span>THE DAILY RITUAL</span>
        <button aria-label="Skip daily game" onClick={close}>
          ×
        </button>
      </div>
      <h2 id="vq-luck-title">Test your luck.</h2>
      <p className="vq-luck-sub">One round. You versus the house.</p>
      {!round ? (
        <div className="vq-luck-choices">
          <button onClick={() => choose("dice")}>
            <span aria-hidden="true">⚄</span>
            <b>VQ Dice</b>
            <small>Higher roll wins · ties reroll</small>
          </button>
          <button onClick={() => choose("blackjack")}>
            <span aria-hidden="true">A♠</span>
            <b>VQ Blackjack</b>
            <small>One hand · hit or stand</small>
          </button>
        </div>
      ) : (
        <div className="vq-luck-table">
          <span className="vq-luck-watermark" aria-hidden="true">
            VQ
          </span>
          {round.mode === "dice" ? (
            <>
              <p>
                YOU <span className="vq-luck-versus">vs</span> HOUSE
              </p>
              <div className="vq-luck-dice">
                {(round.dice || [0, 0]).map((n, i) => (
                  <div
                    key={i}
                    aria-label={`${i === 0 ? "Your" : "House"} die: ${n || "not rolled"}`}
                  >
                    <small>VQ</small>
                    <span aria-hidden="true">
                      {n ? ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1] : "?"}
                    </span>
                  </div>
                ))}
              </div>
              {!result && (
                <button className="vq-luck-primary" onClick={roll}>
                  Tap to roll
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                HOUSE {result ? `· ${total(round.house)}` : "· one card hidden"}
              </p>
              <div className="vq-luck-hand">
                {round.house.map((c, i) => (
                  <PlayingCard key={i} card={c} hidden={!result && i === 1} />
                ))}
              </div>
              <p>YOU · {total(round.player)}</p>
              <div className="vq-luck-hand">
                {round.player.map((c, i) => (
                  <PlayingCard key={i} card={c} />
                ))}
              </div>
              {!result && (
                <div className="vq-luck-actions">
                  <button onClick={() => play(true)}>Hit</button>
                  <button onClick={() => play(false)}>Stand</button>
                </div>
              )}
            </>
          )}
          {result && (
            <div role="status" className={`vq-luck-result ${result}`}>
              <span>YOUR DAILY LUCK METER</span>
              <div className="vq-luck-meter" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <h3>
                {result === "win"
                  ? "Hot hand"
                  : result === "push"
                    ? "Holding steady"
                    : "House takes this round"}
              </h3>
              <p>
                {result === "win"
                  ? "You won this round."
                  : result === "push"
                    ? "An even finish."
                    : "A fresh round tomorrow."}
              </p>
            </div>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <p className="vq-luck-note">
        Just for fun. Random results don’t predict sports or betting outcomes.
        No money, prizes or effect on your record.
      </p>
      {round?.mode === "blackjack" && (
        <p className="vq-luck-rules">
          Single shuffled deck. Aces count as 1 or 11. Blackjack beats other
          21s. Dealer stands on all 17s. No splits, doubles or insurance.
        </p>
      )}
      <button className="vq-luck-close" onClick={close}>
        {result ? "Back to Vegas Quant" : "Skip for today"}
      </button>
      <small className="vq-luck-reset">
        Resets at midnight ET · remembered on this device
      </small>
    </dialog>
  );
}
function PlayingCard({
  card,
  hidden = false,
}: {
  card: Card;
  hidden?: boolean;
}) {
  return (
    <div
      className={`vq-luck-card ${hidden ? "back" : ["♥", "♦"].includes(card.suit) ? "red" : ""}`}
      aria-label={hidden ? "Hidden card" : `${card.rank} ${card.suit}`}
    >
      {hidden ? (
        "VQ"
      ) : (
        <>
          {card.rank}
          <span>{card.suit}</span>
        </>
      )}
    </div>
  );
}
