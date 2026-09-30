"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { time, type Analysis } from "@/lib/domain";

const categories = [
  ["Quick read", ""],
  ["Decisions & props", "Edge Analysis"],
  ["Market", "Market"],
  ["Matchup", "Defensive Matchups"],
  ["Injuries", "Injuries"],
  ["Weather", "Weather"],
  ["Public vs sharp", "Public vs Sharp"],
] as const;

export default function ResearchNotebook({
  analysis,
  slug,
  official,
}: {
  analysis: Analysis;
  slug?: string;
  official: boolean;
}) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const [label, section] = categories[active];
  const content = analysis.sections[section];
  return (
    <div className="research-compact">
      <div className="research-meta">
        <span>
          VERSION {analysis.version} · {time(analysis.created_at)}
        </span>
        <span>{official ? "Official play published" : "No official play"}</span>
      </div>
      <div
        className="research-tabs"
        role="tablist"
        aria-label="Research categories"
      >
        {categories.map(([name], index) => (
          <button
            key={name}
            id={`${id}-tab-${index}`}
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => {
              setActive(index);
              setExpanded(false);
            }}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % categories.length
                  : event.key === "ArrowLeft"
                    ? (index + categories.length - 1) % categories.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? categories.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setActive(next);
                setExpanded(false);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
        className="research-body"
      >
        {active === 0 ? (
          <>
            <h3>{analysis.title}</h3>
            <div className="research-fair-lines">
              {[
                ["True spread", "true_spread"],
                ["True moneyline", "true_moneyline"],
                ["True total", "true_total"],
              ].map(([name, key]) => (
                <div key={key}>
                  <span>{name}</span>
                  <strong>
                    {analysis.projections[key] || "Awaiting analyst"}
                  </strong>
                </div>
              ))}
            </div>
            <p className="research-hint">
              Choose a category above for the analyst’s read. Leans and
              watchlists are not official wagers.
            </p>
          </>
        ) : (
          <>
            <h3>{label}</h3>
            <div
              key={`${analysis.id}-${active}`}
              className={
                expanded ? "research-excerpt expanded" : "research-excerpt"
              }
            >
              <p className="preserve">
                {content || "Not yet provided by Vegas Quant Ultra."}
              </p>
            </div>
            {content && (
              <button
                className="research-more"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show less ↑" : "Read more ↓"}
              </button>
            )}
          </>
        )}
      </div>
      {slug && (
        <Link className="research-footer" href={`/games/${slug}`}>
          Full report & version history <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
