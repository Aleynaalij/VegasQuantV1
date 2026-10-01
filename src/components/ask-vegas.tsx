"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, X, ArrowUpRight, Send, BookOpen } from "lucide-react";
import { findHelp, helpTopics, type HelpTopic } from "@/lib/vegas-help";

type Message = { question: string; topic: HelpTopic | null };
export default function AskVegas() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
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
    setMessages((old) => [
      ...old.slice(-19),
      { question: text.trim().slice(0, 400), topic: topic || findHelp(text) },
    ]);
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
        <MessageCircle size={19} aria-hidden="true" /> Ask Vegas
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
                Ask how the challenge, tabs, bankroll or Copy Pick work. I use
                built-in answers—not live AI—and can point you to the research
                for game questions.
              </p>
            </div>
            {!messages.length && (
              <div className="ask-vegas-suggestions">
                {["purpose", "copy", "bankroll", "targets"].map((id) => {
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
                })}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className="ask-vegas-exchange">
                <p className="ask-vegas-question">{m.question}</p>
                <div className="ask-vegas-answer">
                  <strong>
                    {m.topic?.title || "Let’s find the right guide."}
                  </strong>
                  <p>
                    {m.topic?.answer ||
                      "I don’t have a built-in answer for that wording. Try a short topic such as ‘copy pick’, ‘bankroll’ or ‘account access’, or browse all topics. I can’t see your account, answer general questions or make changes for you."}
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
                      See the official slip <ArrowUpRight size={15} />
                    </Link>
                  )}
                </div>
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
