"use client";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { communityParlayCard } from "@/lib/community-parlay";

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
  if (!legs.length) return null;
  const card = communityParlayCard(title, legs, author, publishedAt);
  return (
    <div className="community-parlay-card">
      <CasinoCard data={card} />
      <CasinoCardDownload data={card} />
    </div>
  );
}
