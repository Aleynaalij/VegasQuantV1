"use client";
import { useEffect, useState } from "react";
import { time } from "@/lib/domain";
import { freshness } from "@/lib/freshness";
import { Badge, SourceLink } from "./ui";
export default function SourceStatus({
  source,
  at,
  kind,
  historical = false,
}: {
  source?: string;
  at?: string;
  kind: "Market observation" | "Analyst publication" | "Published price";
  historical?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const age = now === null ? null : freshness(at, now);
  return (
    <div className="source-status">
      <div>
        <Badge tone={historical ? "muted" : age?.tone}>
          {historical ? "Historical record" : kind}
        </Badge>
        {at && <time dateTime={at}>{time(at)}</time>}
        {age && <span>{age.label}</span>}
      </div>
      <p>
        Source:{" "}
        {source?.trim() ? (
          <SourceLink href={source}>{source}</SourceLink>
        ) : (
          "Not supplied"
        )}
      </p>
      <small>
        {kind === "Market observation"
          ? "Recorded snapshot, not a live quote."
          : kind === "Published price"
            ? "Original published price is locked. Availability may change."
            : "Analyst-supplied research; publication time does not verify every underlying source."}
        {!historical &&
        kind === "Market observation" &&
        (age?.minutes ?? 0) >= 360
          ? " More than 6 hours old — recheck before relying on this price."
          : ""}
      </small>
    </div>
  );
}
