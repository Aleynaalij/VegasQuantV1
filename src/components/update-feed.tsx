"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { deskUpdates } from "@/lib/updates";
import { time, type Desk, type Game } from "@/lib/domain";
import { Panel, Badge } from "./ui";
export default function UpdateFeed({
  desk,
  game,
  memberCode,
}: {
  desk: Desk;
  game: Game;
  memberCode: string | null;
}) {
  const updates = useMemo(() => deskUpdates(desk, game.id), [desk, game.id]);
  const [limit, setLimit] = useState(3),
    [seen, setSeen] = useState<string | null>(null);
  const key = `vq-updates:${memberCode ?? "member"}:${game.id}`;
  useEffect(() => {
    try {
      setSeen(localStorage.getItem(key) || "");
    } catch {
      setSeen("");
    }
    setLimit(3);
  }, [key]);
  const unread = seen === null ? 0 : updates.filter((u) => u.at > seen).length;
  function markRead() {
    const latest = updates[0]?.at ?? "";
    setSeen(latest);
    try {
      localStorage.setItem(key, latest);
    } catch {
      /* Session-only acknowledgement if storage is unavailable. */
    }
  }
  return (
    <Panel
      title="What changed?"
      aside={
        unread > 0 ? (
          <Badge tone="green">{unread} new</Badge>
        ) : (
          <span className="muted">Latest updates</span>
        )
      }
    >
      <div className="update-feed">
        <p className="personal-caption">
          {game.away_team} @ {game.home_team} · Changes from the published
          record.
        </p>
        {!updates.length && <p>No updates published yet.</p>}
        <ol>
          {updates.slice(0, limit).map((u) => (
            <li key={u.id}>
              <div className="update-meta">
                <span>{u.kind}</span>
                <time dateTime={u.at}>{time(u.at)}</time>
              </div>
              <h3>{u.title}</h3>
              <p>{u.summary}</p>
              {u.changes.length > 0 && (
                <div className="update-tags">
                  {u.changes.slice(0, 3).map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                  {u.changes.length > 3 && (
                    <span>+{u.changes.length - 3} more sections</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="personal-toolbar">
          {updates.length > limit && (
            <button
              className="secondary"
              onClick={() => setLimit((n) => n + 5)}
            >
              Show more updates
            </button>
          )}
          {limit > 3 && (
            <button className="secondary" onClick={() => setLimit(3)}>
              Show fewer
            </button>
          )}
          {unread > 0 && (
            <button className="secondary" onClick={markRead}>
              Mark read
            </button>
          )}
          <Link href={`/games/${game.slug}#analysis-history`}>
            Full analysis history →
          </Link>
        </div>
      </div>
    </Panel>
  );
}
