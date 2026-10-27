"use client";
import { useState } from "react";
import Link from "next/link";
import { time, type Game } from "@/lib/domain";
import { Shell, Empty } from "./ui";
export default function GameIndex({ games }: { games: Game[] }) {
  const [query, setQuery] = useState(""),
    [count, setCount] = useState(20);
  const filtered = games
    .filter((g) =>
      `${g.away_team} ${g.home_team} ${g.slot}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  return (
    <Shell active="game">
      <div className="heading">
        <div>
          <span className="eyebrow">RESEARCH INDEX</span>
          <h1>Matchup desk</h1>
          <p>
            Choose a game for analysis, market history and timestamped updates.
          </p>
        </div>
      </div>
      <label className="field">
        Find a team or matchup
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCount(20);
          }}
        />
      </label>
      <div className="workspace-index">
        {filtered.slice(0, count).map((g) => (
          <Link key={g.id} href={`/games/${g.slug}`}>
            <span className="eyebrow">{g.slot}</span>
            <h2>
              {g.away_team} @ {g.home_team}
            </h2>
            <p>{time(g.kickoff)}</p>
            <span>Open research →</span>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <Empty title="No matching games">Try another team name.</Empty>
      )}
      {filtered.length > count && (
        <button className="secondary" onClick={() => setCount((n) => n + 20)}>
          Show 20 more
        </button>
      )}
    </Shell>
  );
}
