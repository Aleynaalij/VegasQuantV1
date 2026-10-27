"use client";
import { useState } from "react";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { communityParlayCards } from "@/lib/community-parlay";

export default function CommunityParlayCard({
  title,
  legs,
  author,
  publishedAt,
}: {
  title: string;
  legs: string[];
  author: string;
  publishedAt: string;
}) {
  const [page, setPage] = useState(0);
  const cards = communityParlayCards(title, legs, author, publishedAt);
  const index = Math.min(page, cards.length - 1);
  if (!cards.length) return null;
  return (
    <div className="community-parlay-card">
      <CasinoCard data={cards[index]} />
      {cards.length > 1 && (
        <div className="social-actions" aria-label="Parlay card pages">
          <button
            type="button"
            className="secondary"
            disabled={index === 0}
            onClick={() => setPage(index - 1)}
          >
            Previous
          </button>
          <span aria-live="polite">
            Card {index + 1} of {cards.length}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={index === cards.length - 1}
            onClick={() => setPage(index + 1)}
          >
            Next
          </button>
        </div>
      )}
      <CasinoCardDownload key={index} data={cards[index]} />
    </div>
  );
}
