"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { zone2Excerpt, type Zone2Post } from "@/lib/zone2";
import { faceInitials, findFaces, type ZoneFace } from "@/lib/zone-faces";
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

/**
 * A research publication in the feed: its stat sheet / chart shows inline and loads on its own once
 * the post scrolls near the screen (Mike: stat sheets must populate without a tap), so the feed
 * still never requests a chart the reader hasn't reached. Original download/auth logic is retained.
 */
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
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!enabled || near) return;
    const el = box.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setNear(true);
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, near]);
  if (!enabled) return <>{children}</>;
  return (
    <section className="zone2-publication" aria-label="Research publication">
      <div
        ref={box}
        className={`zone2-full-research${near ? "" : " zone2-waiting"}`}
        aria-busy={!near}
      >
        {near ? (
          children
        ) : (
          <p className="zone2-excerpt">
            {zone2Excerpt(post.body) || "Loading the research…"}
          </p>
        )}
      </div>
      <p className="zone2-provenance">
        <span>
          Published{" "}
          <time dateTime={post.created_at}>
            {new Date(post.created_at).toLocaleString("en-US", {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            ET
          </time>
        </span>
        <Link
          href={`${basePath}?post=${encodeURIComponent(post.id)}#post-${post.id}`}
        >
          Original publication
        </Link>
        <small>Publication time is not source freshness.</small>
      </p>
    </section>
  );
}

function Face({ face }: { face: ZoneFace }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className={`zone2-face is-${face.sport}`}>
      <span className="zone2-face-img" aria-hidden="true">
        {failed ? (
          <span>{faceInitials(face.name)}</span>
        ) : (
          <img
            src={face.src}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </span>
      <b>{face.name}</b>
    </li>
  );
}

/** The players a post is about, as faces (NBA, NFL, NHL); nothing when no known player is named. */
export function Zone2Faces({
  title,
  legs,
  body,
  sport,
}: {
  title: string;
  legs: string[];
  body: string;
  sport: string;
}) {
  const faces = findFaces(
    [title, ...legs, body.slice(0, 400)].join(" \n "),
    sport,
  );
  if (!faces.length) return null;
  return (
    <ul className="zone2-faces" aria-label="Players in this post">
      {faces.map((f) => (
        <Face key={`${f.sport}:${f.name}`} face={f} />
      ))}
    </ul>
  );
}
