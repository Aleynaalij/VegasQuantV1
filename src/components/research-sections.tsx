"use client";
import { useId, useState, type ReactNode } from "react";

/** One research topic at a time, with full keyboard navigation. */
export default function ResearchSections({
  sections,
}: {
  sections: { title: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  const id = useId();
  return (
    <section className="topic-reader" aria-label="Explore the research">
      <div className="topic-heading">
        <span className="eyebrow">GO A LITTLE DEEPER</span>
        <h2>The research, your way.</h2>
        <p>Choose a topic. Take in one thing at a time.</p>
      </div>
      <div className="topic-tabs" role="tablist" aria-label="Research topics">
        {sections.map((section, index) => (
          <button
            key={section.title}
            id={`${id}-tab-${index}`}
            role="tab"
            aria-selected={active === index}
            aria-controls={`${id}-panel`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % sections.length
                  : event.key === "ArrowLeft"
                    ? (index + sections.length - 1) % sections.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? sections.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setActive(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {section.title}
          </button>
        ))}
      </div>
      <div
        className="topic-content"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
      >
        {sections[active]?.content}
      </div>
    </section>
  );
}
