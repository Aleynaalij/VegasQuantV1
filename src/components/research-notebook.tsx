"use client";
import { useId, useState } from "react";
import { time, type Analysis } from "@/lib/domain";
import { gameResearchTopics } from "@/lib/game-research";
export default function ResearchNotebook({
  analysis,
  versions = [analysis],
  official,
}: {
  analysis: Analysis;
  versions?: Analysis[];
  slug?: string;
  official: boolean;
}) {
  const [chosen, setChosen] = useState("overview");
  const topics = gameResearchTopics(versions, analysis.version);
  const active = topics.find((t) => t.id === chosen) || topics[0];
  const id = useId();
  return (
    <section className="research-compact" aria-label="Game research briefing">
      <div className="research-meta">
        <span>Updated {time(analysis.created_at)}</span>
        <span>{official ? "Official play published" : "Matchup research"}</span>
      </div>
      <p className="research-hint">
        The week's research in one place. Each topic keeps its original date;
        reports can change before kickoff.
      </p>
      <div
        className="research-tabs"
        role="tablist"
        aria-label="Research categories"
      >
        {topics.map((topic, index) => (
          <button
            key={topic.id}
            id={`${id}-${topic.id}`}
            role="tab"
            aria-selected={active?.id === topic.id}
            aria-controls={`${id}-panel`}
            tabIndex={active?.id === topic.id ? 0 : -1}
            onClick={() => setChosen(topic.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % topics.length
                  : event.key === "ArrowLeft"
                    ? (index + topics.length - 1) % topics.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? topics.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setChosen(topics[next].id);
                document.getElementById(`${id}-${topics[next].id}`)?.focus();
              }
            }}
          >
            {topic.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={active ? `${id}-${active.id}` : undefined}
        tabIndex={0}
        className="research-body"
      >
        <h3>{active?.label || "Matchup briefing"}</h3>
        {active?.items.map((item, index) => (
          <article className="game-research-topic" key={item.heading + index}>
            {active.items.length > 1 && <h4>{item.heading}</h4>}
            <small>
              {item.version < analysis.version ? "Earlier topic · " : ""}
              Published {time(item.at)} · v{item.version}
            </small>
            {active.id === "players" ||
            active.id === "form" ||
            item.heading === "Season so far" ? (
              <ul className="game-workload-list">
                {item.text
                  .split("\n")
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            ) : (
              <p className="preserve">{item.text}</p>
            )}
            {!!item.sources.length && (
              <details className="game-research-sources">
                <summary>Publication sources</summary>
                {item.sources.map((url) => (
                  <p key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {new URL(url).hostname} ↗
                    </a>
                  </p>
                ))}
              </details>
            )}
          </article>
        ))}
        {!active && (
          <p>No football briefing has been published for this version.</p>
        )}
      </div>
    </section>
  );
}
