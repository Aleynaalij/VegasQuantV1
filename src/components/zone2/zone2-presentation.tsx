"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { zone2Excerpt, type Zone2Post } from "@/lib/zone2";
import "./zone2.css";

export function Zone2Tools({
  query,
  onQuery,
  researchOnly,
  onResearchOnly,
  count,
}: {
  query: string;
  onQuery: (value: string) => void;
  researchOnly: boolean;
  onResearchOnly: (value: boolean) => void;
  count: number;
}) {
  return (
    <section className="zone2-discovery" aria-label="Research discovery">
      <div className="zone2-heading">
        <span className="eyebrow">THE EVIDENCE / THE CONVERSATION</span>
        <h2>Find your next perspective.</h2>
        <p>Published research and the people discussing it, together.</p>
      </div>
      <div className="zone2-controls">
        <label>
          Search loaded content
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Team, player or research topic"
          />
        </label>
        <label className="zone2-toggle">
          <input
            type="checkbox"
            checked={researchOnly}
            onChange={(e) => onResearchOnly(e.target.checked)}
          />
          Research publications only
        </label>
      </div>
      <p className="zone2-scope" role="status">
        {count} matching items in the loaded feed. Search is not a full
        historical archive.
      </p>
      <nav aria-label="Your research tools">
        <Link href="/research">Full research library</Link>
        <Link href="/saved">Saved picks</Link>
        <Link href="/parlays">My Lays / Build a Lay</Link>
      </nav>
    </section>
  );
}

/** Mount heavyweight chart renderers only when requested; retain their original download/auth logic. */
export function Zone2Publication({
  enabled,
  post,
  children,
  basePath = "/community",
}: {
  enabled: boolean;
  post: Zone2Post;
  children: ReactNode;
  basePath?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!enabled) return <>{children}</>;
  return (
    <section className="zone2-publication" aria-label="Research publication">
      <p className="zone2-excerpt">
        {zone2Excerpt(post.body) ||
          "Open this publication for the complete research and available sources."}
      </p>
      <dl className="zone2-provenance">
        <div>
          <dt>Published</dt>
          <dd>
            <time dateTime={post.created_at}>
              {new Date(post.created_at).toLocaleString("en-US", {
                timeZone: "America/New_York",
              })}{" "}
              ET
            </time>
          </dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>
            <Link
              href={`${basePath}?post=${encodeURIComponent(post.id)}#post-${post.id}`}
            >
              Original publication
            </Link>
          </dd>
        </div>
      </dl>
      <p className="zone2-scope">
        Publication time is not source freshness. Check the original research
        for observation times, sources and limitations.
      </p>
      <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
        <summary>Full research, charts and downloads</summary>
        {expanded ? (
          <div className="zone2-full-research">{children}</div>
        ) : null}
      </details>
    </section>
  );
}
