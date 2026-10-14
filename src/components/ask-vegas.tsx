"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "./brand-mark";
import { X, ArrowUpRight, Send, BookOpen } from "lucide-react";
import { findHelp, helpTopics, type HelpTopic } from "@/lib/vegas-help";
import { citeIntent, recordLine, type CiteIntent } from "@/lib/ask-cite";
import { findRule } from "@/lib/nba-rules";
import { legMarket, legMatchup } from "@/lib/today";
import { time } from "@/lib/domain";
import { supabase } from "@/lib/supabase";

type Message = {
  id: number;
  question: string;
  topic: HelpTopic | null;
  source?: string;
  pending?: boolean;
};
const cited = (
  title: string,
  answer: string,
  href: string,
  link: string,
): HelpTopic => ({
  id: "cited",
  category: "Cited",
  phrases: [],
  title,
  answer,
  href,
  link,
});

/** Looks up the rule, record or published pick a question asks about, with its source. */
async function cite(
  intent: NonNullable<CiteIntent>,
  fallback: HelpTopic | null,
): Promise<{ topic: HelpTopic | null; source?: string }> {
  try {
    if (intent.kind === "rule") {
      const r = findRule(intent.id)!;
      return {
        topic: cited(
          `${r.id} · ${r.title}`,
          r.text,
          `/nba/rules#${r.id}`,
          "Open the NBA rules",
        ),
        source: "The NBA Betting Bible, 2026–27 Edition",
      };
    }
    if (intent.kind === "record") {
      const r = await supabase.rpc("public_research_status");
      if (r.error || !r.data) return { topic: fallback };
      const line = recordLine(r.data.results || []);
      return {
        topic: cited(
          "The published record",
          `${line.text}${line.pending ? `, ${line.pending} pending` : ""}. Every published decision is included, wins and losses. A small sample doesn’t prove an edge.`,
          "/history",
          "See every result on Records",
        ),
        source: r.data.updated_at
          ? `Published record · updated ${time(r.data.updated_at)}`
          : "Published record",
      };
    }
    const r = await supabase
      .from("candidate_releases")
      .select("candidates,created_at,expires_at")
      .contains("candidates", JSON.stringify([{ pick_of_day: true }]))
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const release = r.error ? null : r.data?.[0];
    const c = release?.candidates?.find(
      (x: { pick_of_day?: boolean }) => x.pick_of_day,
    );
    if (!release || !c)
      return {
        topic: cited(
          "No Pick of the Day is live right now",
          "Picks publish in game windows. Home shows the next one as soon as it’s out; members see it there and in The Zone.",
          "/",
          "Open Home",
        ),
      };
    return {
      topic: cited(
        "Today’s published Pick of the Day",
        `${c.name} · ${legMarket(c.market)} (${legMatchup(c.matchup)}). This is research, not a guarantee or advice to bet. Read the case and risks before deciding.`,
        "/",
        "Read the case on Home",
      ),
      source: `Pick of the Day · published ${time(release.created_at)}`,
    };
  } catch {
    return { topic: fallback };
  }
}
export default function AskVegas() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    const el = dialog.current;
    if (!open || !el) return;
    el.showModal();
    return () => el.close();
  }, [open]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, open]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  function ask(text: string, topic?: HelpTopic) {
    if (!text.trim()) return;
    const id = ++nextId.current,
      intent = topic ? null : citeIntent(text),
      fallback = topic || findHelp(text);
    setMessages((old) => [
      ...old.slice(-19),
      {
        id,
        question: text.trim().slice(0, 400),
        topic: intent ? null : fallback,
        pending: !!intent,
      },
    ]);
    if (intent)
      void cite(intent, fallback).then((r) =>
        setMessages((old) =>
          old.map((m) => (m.id === id ? { ...m, ...r, pending: false } : m)),
        ),
      );
    setQuestion("");
    setBrowse(false);
  }
  return (
    <>
      <button
        ref={launcher}
        type="button"
        className="ask-vegas-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="ask-vegas-dialog"
        onClick={() => setOpen(true)}
      >
        <BrandMark /> Ask Vegas
      </button>
      <dialog
        ref={dialog}
        id="ask-vegas-dialog"
        className="ask-vegas-dialog"
        aria-labelledby="ask-vegas-title"
        onCancel={close}
        onClose={() => {
          setOpen(false);
          launcher.current?.focus();
        }}
      >
        <header className="ask-vegas-header">
          <div>
            <strong id="ask-vegas-title">Ask Vegas</strong>
            <small>Your built-in platform guide</small>
          </div>
          <button
            autoFocus
            type="button"
            aria-label="Close Ask Vegas"
            onClick={close}
          >
            <X size={21} />
          </button>
        </header>
        <div className="ask-vegas-toolbar">
          <button
            type="button"
            onClick={() => setBrowse(!browse)}
            aria-expanded={browse}
          >
            <BookOpen size={15} />{" "}
            {browse ? "Back to chat" : "Browse all topics"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setQuestion("");
              setBrowse(false);
            }}
          >
            Clear
          </button>
        </div>
        {browse ? (
          <div className="ask-vegas-topics">
            {[...new Set(helpTopics.map((t) => t.category))].map((category) => (
              <section key={category}>
                <h3>{category}</h3>
                {helpTopics
                  .filter((t) => t.category === category)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => ask(t.title, t)}
                    >
                      {t.title}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <div
            className="ask-vegas-chat"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Platform help conversation"
          >
            <div className="ask-vegas-answer">
              <strong>Make yourself at home.</strong>
              <p>
                Ask about The Zone, Community, your tailed-pick Records or NBA.
                I use built-in answers, not live AI. I can quote an NBA rule
                (“What is R-12?”), the published record and today’s published
                pick, with the source, but I don’t give betting advice.
              </p>
            </div>
            {!messages.length && (
              <div className="ask-vegas-suggestions">
                {["navigation", "join", "community-posting", "nba"].map(
                  (id) => {
                    const t = helpTopics.find((x) => x.id === id)!;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => ask(t.title, t)}
                      >
                        {t.title}
                      </button>
                    );
                  },
                )}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="ask-vegas-exchange">
                <p className="ask-vegas-question">{m.question}</p>
                {m.pending ? (
                  <div className="ask-vegas-answer" role="status">
                    <p>Looking that up…</p>
                  </div>
                ) : (
                  <div className="ask-vegas-answer">
                    <strong>
                      {m.topic?.title || "Let’s find the right guide."}
                    </strong>
                    <p>
                      {m.topic?.answer ||
                        "I don’t have a built-in answer for that wording. Try a short topic such as ‘tail a pick’, ‘NBA’ or ‘account access’, or browse all topics. I can’t see your account, answer general questions or make changes for you."}
                    </p>
                    {m.topic ? (
                      <Link href={m.topic.href} onClick={close}>
                        {m.topic.link} <ArrowUpRight size={15} />
                      </Link>
                    ) : (
                      <button type="button" onClick={() => setBrowse(true)}>
                        Browse all topics
                      </button>
                    )}
                    {m.topic?.id === "pick-routing" && (
                      <Link href="/" onClick={close}>
                        View Pick of the Day & Hail Mary{" "}
                        <ArrowUpRight size={15} />
                      </Link>
                    )}
                    {m.source && (
                      <small className="ask-vegas-source">
                        Source: {m.source}
                      </small>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={end} />
          </div>
        )}
        <form
          className="ask-vegas-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor="ask-vegas-question" className="ask-vegas-sr">
            Ask about Vegas Quant
          </label>
          <input
            id="ask-vegas-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={400}
            placeholder="How do I copy a pick?"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!question.trim()}
            aria-label="Send help question"
          >
            <Send size={18} />
          </button>
        </form>
        <p className="ask-vegas-privacy">
          No AI API calls. Chat stays in this page’s memory. Don’t share
          passwords or payment details.
        </p>
      </dialog>
    </>
  );
}
